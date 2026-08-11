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

import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const freshMeta = (cycle) => ({ cycle, roundsInCycle: 0, best: null, nonProgressStreak: 0, lastRound: 0 });

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

  // Every rebuttal written so far, not only round n's: the author writes round
  // n's rebuttal AFTER the round-n guard call (SKILL loop step 6 follows step 4),
  // so it is never on disk for its own run and a later run must pick it up.
  // Re-applying an already-folded status is idempotent.
  for (let i = 1; i <= n; i++) {
    const rebuttalPath = join(scratchDir, `round-${i}.rebuttal.json`);
    if (!existsSync(rebuttalPath)) continue;
    const reb = readJson(rebuttalPath);
    for (const [id, v] of Object.entries(reb.statuses ?? {})) {
      const cur = byId.get(id);
      if (!cur) {
        // A rebuttal id with no ledger match (a mistyped or stale id) is an
        // authoring error the deterministic guard exists to catch, not swallow.
        process.stderr.write(`guard: rebuttal round ${i} references unknown finding id ${id}; ignored\n`);
        continue;
      }
      if (v.status !== 'resolved' && v.status !== 'wontfix') continue;
      // A reopen at round k overrules every rebuttal written before k; only a
      // rebuttal from round k or later re-settles the status. Without this skip,
      // a later round that simply omits a reopened id lets this loop replay the
      // stale pre-reopen `resolved`, silently reverting the dispute out of b(n)
      // (status is otherwise re-derived from disk every call, not preserved by
      // omission the way `tag` is).
      if (cur.reopenedAt != null && i < cur.reopenedAt) continue;
      cur.status = v.status;
      cur.statusRound = i;
    }
  }

  // A reviewer re-raising a finding disputes the author's `resolved`: without
  // this, a review converges on the author's say-so and the adversarial filter is
  // one-sided. A re-emission at round n overrides a rebuttal from an earlier
  // round only -- one written at round n or later already answers this review.
  // `wontfix` is the author's call and is never overridden here; a contested one
  // is surfaced to the user by the `contested` verdict below instead.
  for (const f of review.findings ?? []) {
    const cur = byId.get(f.id);
    if (cur?.status === 'resolved' && (cur.statusRound ?? 0) < n) {
      cur.status = 'open';
      cur.reopenedAt = n;
      delete cur.statusRound; // documented absent while open; reopenedAt now carries the dispute round
    }
  }

  // A `wontfix` re-emitted this round is a live dispute of the author's decision.
  // It is not reopened (status stays wontfix, excluded from b), but it must not
  // let the round converge silently: b(n)=0 with a contested wontfix yields the
  // `contested` verdict, which stops and surfaces to the user like stall/cap.
  const contestedWontfix = (review.findings ?? []).some((f) => byId.get(f.id)?.status === 'wontfix');

  const b = ledger.findings.filter((f) => f.tag === 'blocking' && f.status === 'open').length;
  if (review.openBlocking != null && review.openBlocking !== b) {
    process.stderr.write(`guard: openBlocking ${review.openBlocking} != computed b(${n})=${b}; using ${b}\n`);
  }

  const m = ledger.meta;
  const firstReview = m.best === null;
  const progress = firstReview || b < m.best;

  // Advance the per-cycle counters once per round only. A same-`n` re-run (a
  // crash/retry of the SKILL loop's step-4 CLI call) must not double-bump
  // roundsInCycle or nonProgressStreak, which would spuriously flip a verdict to
  // stalled/cap; the status/reopen folds above are already idempotent, so a
  // re-run then reproduces the same verdict from unchanged state.
  if (n > (m.lastRound ?? 0)) {
    m.roundsInCycle += 1;
    if (b !== 0) m.nonProgressStreak = progress ? 0 : m.nonProgressStreak + 1;
    m.best = firstReview ? b : Math.min(m.best, b);
    m.lastRound = n;
  }

  let verdict;
  if (b === 0) {
    verdict = contestedWontfix ? 'contested' : 'converged';
  } else if (m.nonProgressStreak >= 2) {
    verdict = 'stalled';
  } else if (m.roundsInCycle >= 5) {
    verdict = 'cap';
  } else {
    verdict = 'continue';
  }

  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
  return { verdict, b, best: m.best };
}

// --- CLI wrapper ------------------------------------------------------------
const argv = process.argv;
// argv[1] may be a SYMLINK -- a plugin install exposes this skill at
// `.claude/skills/spec-review-board`, a link into the plugin cache -- while
// import.meta.url is always the realpath. `resolve` absolutizes without following
// links, so comparing against it never matches through the documented install path
// and the CLI block below silently no-ops: the convergence verdict is never
// computed and the review loop has nothing to stop it. realpathSync collapses the
// link; an argv[1] not on disk falls back to the absolutized form.
const realArgv1 = (p) => { try { return realpathSync(resolve(p)); } catch { return resolve(p); } };
const invokedDirectly = argv[1] && fileURLToPath(import.meta.url) === realArgv1(argv[1]);
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
