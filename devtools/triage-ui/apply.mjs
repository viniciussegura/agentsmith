/**
 * Shared /instruction-apply engine. Consumes the triage worksheet and executes
 * every decision in one crash-idempotent pass: adopt writes/creates the rule
 * file (one file == one rule, post one-file-per-tag), reject/fold/defer append a
 * canonical decisions-log line, refine/park are left, rehome/reowner are
 * reported skipped (deferred). Terminal verdicts are spliced and the worksheet
 * is atomically rewritten via the canonical serializer.
 *
 * Dev-only (under devtools/, never installed or published). Zero deps.
 *
 * Used by both `npm run triage`'s POST /api/apply and the /instruction-apply
 * command. The test-gate is INJECTABLE (opts.gate) so the engine is unit-
 * testable without a full repo checkout; the default gate regenerates and runs
 * the suite.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateFile, validateCrossRefs, canonicalJSON, migrateWorksheet } from './schema.mjs';

const read = (p) => readFileSync(p, 'utf8');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function atomicWrite(path, content) {
  const tmp = path + '.tmp';
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

/** Ensure `  <tag>: <owner>` exists in ownership.yaml, grouped after the owner's last row. Idempotent. */
function ensureOwnerRow(ownershipPath, tag, owner) {
  const text = read(ownershipPath);
  const lines = text.split('\n');
  if (lines.some((l) => new RegExp('^\\s+' + esc(tag) + ':\\s').test(l))) return;
  let last = -1;
  const valRe = new RegExp('^  [\\w-]+:\\s*' + esc(owner) + '\\s*$');
  for (let k = 0; k < lines.length; k++) if (valRe.test(lines[k])) last = k;
  const row = `  ${tag}: ${owner}`;
  if (last === -1) { writeFileSync(ownershipPath, text.replace(/\n+$/, '') + '\n' + row + '\n'); return; }
  lines.splice(last + 1, 0, row);
  writeFileSync(ownershipPath, lines.join('\n'));
}

/** Ensure the tag's decisions-log line (canonical grammar), one per tag, update in place. */
function ensureDecisionLine(decisionsPath, verdict, e) {
  const lines = read(decisionsPath).split('\n');
  const tag = e.tag;
  const d = e.decision;
  const line =
    verdict === 'reject' ? `- \`#${tag}\` -- rejected: ${d.details}`
      : verdict === 'fold' ? `- \`#${tag}\` -- folded into \`${d.foldTarget}\`: ${d.details}`
        : `- \`#${tag}\` -- deferred: ${d.details} (-> ${e.targetFile.split('/').pop()}, ${e.role})`;
  const header = { reject: '## Rejected', fold: '## Folded', defer: '## Deferred' }[verdict];
  const tagRe = new RegExp('^- `#' + esc(tag) + '`\\s+--\\s');
  const ix = lines.findIndex((l) => tagRe.test(l));
  if (ix !== -1) { lines[ix] = line; writeFileSync(decisionsPath, lines.join('\n')); return; }
  const h = lines.findIndex((l) => l.trim() === header);
  if (h === -1) throw new Error(`no "${header}" section in decisions log`);
  let end = h + 1;
  while (end < lines.length && !/^## /.test(lines[end])) end++;
  let ins = end;
  while (ins > h + 1 && lines[ins - 1].trim() === '') ins--;
  lines.splice(ins, 0, line);
  writeFileSync(decisionsPath, lines.join('\n'));
}

/** Default gate: regenerate, then run the full suite. Throws on failure. */
function defaultGate(root, testTimeoutMs) {
  execFileSync('node', ['bin/cli.js'], { cwd: root, stdio: 'pipe' });
  execFileSync('node', ['--test'], { cwd: root, stdio: 'pipe', timeout: testTimeoutMs });
}

/**
 * @param {object} opts
 * @param {string} opts.root           Repo root.
 * @param {string} opts.triagePath     Path to triage.json.
 * @param {(root:number)=>void} [opts.gate]  Adopt gate (default: regenerate + node --test). Pass () => {} to skip.
 * @param {string[]} [opts.liveTags]   Live #tags for fold cross-ref validation (default []).
 * @param {number} [opts.testTimeoutMs]
 * @param {(ev:object)=>void} [opts.onProgress]  Progress callback: {type:'start',total} |
 *        {type:'entry',phase:'begin'|'gate'|'done',i,total,tag,verdict,outcome?}.
 * @returns {Promise<object>} report
 */
export async function apply({ root, triagePath, gate, liveTags = [], testTimeoutMs = 120000, onProgress }) {
  const runGate = gate || ((r) => defaultGate(r, testTimeoutMs));
  const emit = typeof onProgress === 'function' ? onProgress : () => {};
  const ownershipPath = join(root, 'instructions/ownership.yaml');
  const decisionsPath = join(root, 'docs/instruction-rules-decisions.md');

  if (!existsSync(triagePath)) return { error: 'nothing to apply' };
  const file = migrateWorksheet(JSON.parse(read(triagePath)));
  if (!Array.isArray(file.entries) || file.entries.length === 0) return { error: 'nothing to apply' };

  // rehome/reowner are deferred (reported skipped, untouched), so their cross-refs
  // (e.g. reowner.proposedOwner) are out of scope -- exclude them from the gate.
  const xrefFile = { ...file, entries: file.entries.filter((e) => e.kind !== 'rehome' && e.kind !== 'reowner') };
  const problems = [...validateFile(file), ...validateCrossRefs(xrefFile, { liveTags, resolvableOwners: [] })];
  if (problems.length) return { error: 'invalid', problems };

  const report = { adopted: [], rejected: [], folded: [], deferred: [], refined: [], parked: [], skipped: [], failed: [] };
  let entries = file.entries;
  const total = entries.length;
  const rewrite = () => atomicWrite(triagePath, canonicalJSON({ ...file, entries }));
  let i = 0;
  emit({ type: 'start', total });

  while (i < entries.length) {
    const e = entries[i];
    const v = e.decision?.verdict || 'park';
    const splice = () => { entries = entries.filter((x) => x !== e); rewrite(); };
    const done = (outcome) => emit({ type: 'entry', phase: 'done', i, total, tag: e.tag, verdict: v, outcome });
    emit({ type: 'entry', phase: 'begin', i, total, tag: e.tag, verdict: v });

    if (v === 'refine') { report.refined.push({ tag: e.tag, details: e.decision.details, reply: e.lastRoundReply }); done('refined'); i++; continue; }
    if (v === 'park') { report.parked.push(e.tag); done('parked'); i++; continue; }
    if (e.kind === 'rehome' || e.kind === 'reowner') { report.skipped.push(e.tag); done('skipped'); i++; continue; }

    if (v === 'reject' || v === 'fold' || v === 'defer') {
      try { ensureDecisionLine(decisionsPath, v, e); }
      catch (err) { report.failed.push({ tag: e.tag, reason: String(err.message || err) }); done('failed'); i++; continue; }
      report[{ reject: 'rejected', fold: 'folded', defer: 'deferred' }[v]].push(e.tag);
      done({ reject: 'rejected', fold: 'folded', defer: 'deferred' }[v]);
      splice();
      continue;
    }

    if (v === 'adopt') {
      if (e.status?.state !== 'ready') { report.failed.push({ tag: e.tag, reason: `status not ready (${e.status?.state})` }); done('failed'); i++; continue; }
      const abs = join(root, e.targetFile);
      const snap = new Map();
      snap.set(abs, existsSync(abs) ? read(abs) : null);
      if (e.kind === 'new-rule') snap.set(ownershipPath, read(ownershipPath));
      try {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, e.draft.replace(/\n+$/, '') + '\n');
        if (e.kind === 'new-rule') ensureOwnerRow(ownershipPath, e.tag, e.role);
        emit({ type: 'entry', phase: 'gate', i, total, tag: e.tag, verdict: v });
        runGate(root);
      } catch (err) {
        for (const [p, c] of snap) { if (c === null) rmSync(p, { force: true }); else writeFileSync(p, c); }
        const msg = (err.stderr ? err.stderr.toString() : '') + (err.message || String(err));
        e.decision = { verdict: 'park' };
        e.applyLog.push(`apply failed ${file.round}: ${msg.slice(0, 500)}`);
        rewrite();
        report.failed.push({ tag: e.tag, reason: msg.split('\n')[0].slice(0, 200) });
        done('failed');
        i++;
        continue;
      }
      report.adopted.push(e.tag);
      done('adopted');
      splice();
      continue;
    }
    report.parked.push(e.tag);
    done('parked');
    i++;
  }
  return report;
}

// CLI: node devtools/triage-ui/apply.mjs
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const triagePath = join(root, '.agentsmith/instruction-review/triage.json');
  // Live #tags (for fold cross-ref): headings in the generated output.
  let liveTags = [];
  try {
    const out = execFileSync('node', ['bin/cli.js', '--stdout'], { cwd: root, encoding: 'utf8' });
    liveTags = [...out.matchAll(/^#{1,6}\s+(#\S+)/gm)].map((m) => m[1]);
  } catch { /* leave empty; only fold entries need it */ }
  const onProgress = (ev) => {
    if (ev.type === 'start') process.stderr.write(`applying ${ev.total} entr${ev.total === 1 ? 'y' : 'ies'}…\n`);
    else if (ev.phase === 'begin') process.stderr.write(`  [${ev.i + 1}/${ev.total}] #${ev.tag} (${ev.verdict})\n`);
    else if (ev.phase === 'gate') process.stderr.write(`        running node --test…\n`);
    else if (ev.phase === 'done') process.stderr.write(`        -> ${ev.outcome}\n`);
  };
  apply({ root, triagePath, liveTags, onProgress })
    .then((r) => { console.log(JSON.stringify(r, null, 2)); })
    .catch((err) => { console.error(err); process.exit(1); });
}
