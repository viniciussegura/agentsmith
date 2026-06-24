#!/usr/bin/env node
// Deterministic persistence for the code-review board (#ai-review-board).
//
// Reads the round's JSON scratch (round meta, findings, verdicts, pm-directive)
// and writes the canonical JSON store, applying verdicts, reconcile transitions,
// and the PM directive. Zero dependency: JSON.parse/JSON.stringify only. Runs the
// store linter as its last step and returns (CLI: exits) non-zero on any violation.
//
// Usage:
//   node persist.mjs summary <store-dir> <round-id>
//   node persist.mjs apply   <store-dir> <round-id>

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv, stdout, stderr, exit } from 'node:process';
import { lintStore, parseId, idToSafe } from './lint.mjs';

// ---------- io helpers ----------

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

function writeJson(p, o) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(o, null, 2) + '\n');
}

function slugify(title) {
  const s = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 6)
    .join('-');
  return s || 'issue';
}

const issueFileName = (issue) => `${idToSafe(issue.id)}-${slugify(issue.title)}.json`;

// Default scratch dir for a store: .agentsmith/review-board -> .agentsmith/tmp/review-board/<roundId>.
function defaultScratchDir(store, roundId) {
  return join(dirname(store), 'tmp', 'review-board', roundId);
}

function readDirJson(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((e) => e.endsWith('.json'))
    .map((e) => readJson(join(dir, e)));
}

function walk(dir, fn) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) walk(abs, fn);
    else if (e.name.endsWith('.json')) fn(abs);
  }
}

// Index existing issue files by id -> { absPath, obj, roleDir, placement }.
function indexStore(store) {
  const index = new Map();
  walk(join(store, 'issues'), (abs) => {
    const obj = readJson(abs);
    const relParts = abs.slice(join(store, 'issues').length + 1).split(/[\\/]/);
    const roleDir = relParts[0];
    const placement = relParts.includes('closed') ? 'closed' : relParts.includes('promoted') ? 'promoted' : 'open';
    index.set(obj.id, { absPath: abs, obj, roleDir, placement });
  });
  return index;
}

function issuePath(store, roleDir, placement, issue) {
  const dir = placement === 'open' ? join(store, 'issues', roleDir) : join(store, 'issues', roleDir, placement);
  return join(dir, issueFileName(issue));
}

// ---------- apply ----------

/**
 * Write the store for a round from its JSON scratch. Never throws on store
 * content; throws only on malformed/unreadable scratch (fail closed before any write).
 * @param {{ store: string, roundId: string, scratchDir?: string }} input
 * @returns {{ written: string[], errors: string[], warnings: string[] }}
 */
export function persistApply({ store, roundId, scratchDir }) {
  const scratch = scratchDir || defaultScratchDir(store, roundId);
  // Parse ALL inputs up front so malformed scratch fails before any write.
  const round = readJson(join(scratch, 'round.json'));
  const findings = readDirJson(join(scratch, 'findings'));
  const verdicts = readDirJson(join(scratch, 'verdicts'));
  const directive = existsSync(join(scratch, 'pm-directive.json'))
    ? readJson(join(scratch, 'pm-directive.json'))
    : {};

  const accepted = new Set(verdicts.filter((v) => v.verdict === 'accept').map((v) => v.id));
  const pmRejected = new Set((directive.rejections || []).map((r) => r.id));
  const priorityOf = new Map((directive.priorityOverrides || []).map((p) => [p.id, p]));
  const dupOf = new Map((directive.duplicates || []).map((d) => [d.id, d]));

  const written = [];

  // 1) Verified-new issues.
  for (const f of findings) {
    const roleDir = f.role;
    for (const raw of f.new || []) {
      if (!accepted.has(raw.id) || pmRejected.has(raw.id)) continue;
      const issue = {
        ...raw,
        kind: 'issue',
        lastConfirmedCommit: raw.lastConfirmedCommit || round.baselineCommit,
      };
      const po = priorityOf.get(issue.id);
      if (po) {
        issue.priority = po.priority;
        issue.priorityRationale = po.rationale;
      }
      const dup = dupOf.get(issue.id);
      if (dup) {
        issue.status = 'duplicated';
        issue.closingComments = dup.comment || `duplicate of ${dup.canonical}`;
        issue.closedInRound = round.id;
        issue.relatedIssues = [...(issue.relatedIssues || []), { issueId: dup.canonical, description: 'duplicate-of' }];
        const p = issuePath(store, roleDir, 'closed', issue);
        writeJson(p, issue);
        written.push(p);
      } else {
        issue.status = 'open';
        const p = issuePath(store, roleDir, 'open', issue);
        writeJson(p, issue);
        written.push(p);
      }
    }
  }

  // 2) Reconcile transitions (Task 4 fills this in).
  applyReconcile({ store, round, findings, written });

  // 3) Epics (Task 5 fills this in).
  applyEpics({ store, round, directive, written });

  // 4) Round file.
  const roundPath = join(store, 'rounds', `${round.id}.json`);
  writeJson(roundPath, round);
  written.push(roundPath);

  // 5) Validate.
  const { errors, warnings } = lintStore({ root: store });
  return { written, errors, warnings };
}

// Stubs replaced in later tasks.
function applyReconcile() {}
function applyEpics() {}

// ---------- summary (Task 7) ----------

export function persistSummary() {
  throw new Error('not implemented');
}

// ---------- CLI ----------

const invokedDirectly = argv[1] && fileURLToPath(import.meta.url) === resolve(argv[1]);
if (invokedDirectly) {
  const [cmd, storeArg, roundId] = argv.slice(2);
  const store = resolve(storeArg || '');
  try {
    if (cmd === 'apply') {
      const { errors, warnings } = persistApply({ store, roundId });
      for (const w of warnings) stderr.write(`warning: ${w}\n`);
      for (const e of errors) stderr.write(`error: ${e}\n`);
      stdout.write(`review-board persist apply: ${errors.length} error(s)\n`);
      if (errors.length) exit(1);
    } else if (cmd === 'summary') {
      persistSummary({ store, roundId });
      stdout.write('review-board persist summary: ok\n');
    } else {
      stderr.write('usage: persist.mjs <summary|apply> <store-dir> <round-id>\n');
      exit(2);
    }
  } catch (err) {
    stderr.write(`error: ${err.message}\n`);
    exit(1);
  }
}
