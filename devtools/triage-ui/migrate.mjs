/**
 * One-time migration: the markdown triage worksheet (v3) -> triage.json.
 *
 * The live `.agentsmith/instruction-review/triage.md` is already v3-migrated, so
 * its strengthen entries carry `current:` blocks. This copies metadata,
 * `current:`/`draft:` bodies, and decisions into the JSON schema. Every live
 * entry is `park`/`ready`; a ticked checkbox during migration is unexpected and
 * fails loudly (triage happens in the JSON tool, not before migration).
 *
 * `parseWorksheet` is the testable core; the CLI tail reads/writes files.
 */

import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateFile, canonicalJSON } from './schema.mjs';

const VERDICT_LABELS = ['adopt', 'reject', 'fold', 'defer', 'refine'];

/** Extract the fenced body following a bare `marker:` line, or null if absent. */
function extractFence(lines, marker) {
  const mi = lines.findIndex((l) => l.trim() === `${marker}:`);
  if (mi === -1) return null;
  let open = -1;
  for (let i = mi + 1; i < lines.length; i++) {
    if (/^`{3,}\s*$/.test(lines[i])) { open = i; break; }
    if (lines[i].trim() !== '') break; // non-blank, non-fence -> no block
  }
  if (open === -1) return null;
  const body = [];
  for (let i = open + 1; i < lines.length; i++) {
    if (/^`{3,}\s*$/.test(lines[i])) return body.join('\n');
    body.push(lines[i]);
  }
  throw new Error(`unterminated ${marker} fence`);
}

function getMeta(lines, key) {
  const line = lines.find((l) => l.startsWith(`- ${key}:`));
  return line ? line.slice(`- ${key}:`.length).trim() : undefined;
}

function tickedVerdict(lines) {
  const di = lines.findIndex((l) => l.trim() === 'decision:');
  if (di === -1) return null;
  for (let i = di + 1; i < lines.length; i++) {
    const m = lines[i].match(/^- \[[xX]\]\s*(\S+)/);
    if (m) {
      if (!VERDICT_LABELS.includes(m[1])) throw new Error(`unknown ticked verdict "${m[1]}"`);
      return m[1];
    }
    if (lines[i].trim() === 'decisionText:') break;
  }
  return null;
}

function parseEntry(chunk) {
  const lines = chunk.replace(/\n+$/, '').split('\n');
  const tag = lines[0].replace(/^###\s+/, '').trim().split(/\s+/)[0];
  const kind = getMeta(lines, 'kind');
  const role = getMeta(lines, 'role');
  const targetFile = getMeta(lines, 'targetFile');
  const statusStr = getMeta(lines, 'status') || 'ready';
  const gap = getMeta(lines, 'gap');
  const current = extractFence(lines, 'current');
  const draft = extractFence(lines, 'draft');

  const ticked = tickedVerdict(lines);
  if (ticked) {
    throw new Error(`entry "${tag}": unexpected ticked decision "${ticked}" during migration`);
  }

  let status;
  if (statusStr === 'ready') {
    status = { state: 'ready' };
  } else {
    const blockedOn = getMeta(lines, 'blockedOn');
    if (!blockedOn) throw new Error(`entry "${tag}": status ${statusStr} without blockedOn`);
    status = { state: statusStr, blockedOn };
  }

  const entry = {
    tag,
    kind,
    role,
    targetFile,
    status,
    gap,
    decision: { verdict: 'park' },
    applyLog: [],
  };
  if (current !== null) entry.current = current;
  if (draft !== null) entry.draft = draft;
  return entry;
}

/** Parse a v3 markdown worksheet into a TriageFile object. */
export function parseWorksheet(md) {
  const text = md.replace(/\r\n/g, '\n');
  const parts = text.split(/(?=^### )/m);
  const preamble = parts[0];
  const roundMatch = preamble.match(/round (\d{4}-\d{2}-\d{2})/);
  const round = roundMatch ? roundMatch[1] : '2026-06-16';
  const entries = parts.slice(1).map(parseEntry);
  return { round, entries };
}

function summarize(file) {
  const by = {};
  for (const e of file.entries) by[e.kind] = (by[e.kind] || 0) + 1;
  return by;
}

// CLI: node devtools/triage-ui/migrate.mjs [in.md] [out.json]
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inPath = process.argv[2] || '.agentsmith/instruction-review/triage.md';
  const outPath = process.argv[3] || '.agentsmith/instruction-review/triage.json';
  const md = readFileSync(inPath, 'utf8');
  const headingCount = (md.replace(/\r\n/g, '\n').match(/^### /gm) || []).length;
  const file = parseWorksheet(md);

  // assert the counts actually parsed (internal consistency), don't hardcode the split
  if (file.entries.length !== headingCount) {
    throw new Error(`parsed ${file.entries.length} entries but found ${headingCount} headings`);
  }
  const problems = validateFile(file);
  if (problems.length) {
    throw new Error(`migration produced invalid triage.json:\n  ${problems.join('\n  ')}`);
  }

  writeFileSync(outPath, canonicalJSON(file), 'utf8');
  rmSync(inPath);
  console.log(`migrated ${file.entries.length} entries -> ${outPath}`);
  console.log(`breakdown: ${JSON.stringify(summarize(file))}`);
  console.log(`removed ${inPath}`);
}
