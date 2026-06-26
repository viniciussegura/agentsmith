#!/usr/bin/env node
// Deterministic convergence guard for spec auto-review (#ai-spec-review),
// the third application of the role-based review engine (#ai-review-engine).
//
// Merges the generalist's converged round review into the running ledger and
// evaluates the convergence guard. All deterministic spec-review state lives
// here so the orchestrating model never hand-walks the ledger. Zero dependency:
// JSON.parse/JSON.stringify only. Fails closed (throws / CLI exits non-zero) on
// a finding missing origin/tag or malformed JSON.
//
// Authority split: the GENERALIST owns the `tag` (and may down-tag a specialist
// blocker to nit, with a tagReason); the AUTHOR owns the `status`
// (resolved/wontfix, via the rebuttal). guard.mjs invents neither.
//
// Usage:
//   node guard.mjs <scratch-dir> <n> [--new-cycle]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const freshMeta = (cycle) => ({ cycle, roundsInCycle: 0, best: null, nonProgressStreak: 0 });

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`guard: bad JSON ${p}: ${e.message}`);
  }
}

// Pure-ish core: reads/writes ledger.json under scratchDir; returns { verdict, b, best }.
export function runGuard({ scratchDir, n, newCycle = false }) {
  const ledgerPath = join(scratchDir, 'ledger.json');
  const ledger = existsSync(ledgerPath) ? readJson(ledgerPath) : { meta: freshMeta(1), findings: [] };
  if (newCycle) ledger.meta = freshMeta(ledger.meta.cycle + 1);

  const review = readJson(join(scratchDir, `round-${n}.review.json`));
  const byId = new Map(ledger.findings.map((f) => [f.id, f]));

  for (const f of review.findings ?? []) {
    if (!f.id || !f.origin || !f.tag) {
      throw new Error(`guard: finding ${f.id ?? '?'} missing origin/tag`);
    }
    const cur = byId.get(f.id);
    if (!cur) {
      const entry = {
        id: f.id, origin: f.origin, tag: f.tag, tagReason: f.tagReason,
        problem: f.problem, fix: f.fix,
        status: 'open', roundRaised: n,
        tagHistory: [{ round: n, tag: f.tag, by: f.origin, reason: f.tagReason }],
      };
      byId.set(f.id, entry);
      ledger.findings.push(entry);
    } else if (cur.tag !== f.tag) {
      cur.tagHistory.push({ round: n, tag: f.tag, by: 'generalist', reason: f.tagReason });
      cur.tag = f.tag;
      if (f.tagReason) cur.tagReason = f.tagReason;
    }
    // An id present in the ledger but NOT re-emitted keeps its tag (reconcile
    // preservation, by omission). transition reporting in findings/<role>.json
    // is advisory and never mutates status here.
  }

  const rebuttalPath = join(scratchDir, `round-${n}.rebuttal.json`);
  if (existsSync(rebuttalPath)) {
    const reb = readJson(rebuttalPath);
    for (const [id, v] of Object.entries(reb.statuses ?? {})) {
      const cur = byId.get(id);
      if (cur && (v.status === 'resolved' || v.status === 'wontfix')) cur.status = v.status;
    }
  }

  const b = ledger.findings.filter((f) => f.tag === 'blocking' && f.status === 'open').length;
  if (review.openBlocking != null && review.openBlocking !== b) {
    process.stderr.write(`guard: openBlocking ${review.openBlocking} != computed b(${n})=${b}; using ${b}\n`);
  }

  const m = ledger.meta;
  m.roundsInCycle += 1;
  const firstReview = m.best === null;
  const progress = firstReview || b < m.best;

  let verdict;
  if (b === 0) {
    verdict = 'converged';
  } else {
    m.nonProgressStreak = progress ? 0 : m.nonProgressStreak + 1;
    if (m.nonProgressStreak >= 2) verdict = 'stalled';
    else if (m.roundsInCycle >= 5) verdict = 'cap';
    else verdict = 'continue';
  }
  m.best = firstReview ? b : Math.min(m.best, b);

  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
  return { verdict, b, best: m.best };
}

// --- CLI wrapper ------------------------------------------------------------
const argv = process.argv;
const invokedDirectly = argv[1] && fileURLToPath(import.meta.url) === resolve(argv[1]);
if (invokedDirectly) {
  const rest = argv.slice(2);
  const newCycle = rest.includes('--new-cycle');
  const pos = rest.filter((a) => !a.startsWith('--'));
  const [scratchDir, nRaw] = pos;
  if (!scratchDir || nRaw == null) {
    process.stderr.write('usage: node guard.mjs <scratch-dir> <n> [--new-cycle]\n');
    process.exit(2);
  }
  try {
    const { verdict, b, best } = runGuard({ scratchDir, n: Number(nRaw), newCycle });
    process.stdout.write(`${verdict} b(${Number(nRaw)})=${b} best=${best}\n`);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}
