import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runGuard } from '../tools/claude/skills/spec-review-board/guard.mjs';
import { withTempDir } from '../test-helpers/tmp-dir.mjs';

const scratch = (t) => withTempDir(t, 'sr-guard-');
function writeJson(p, o) {
  writeFileSync(p, JSON.stringify(o, null, 2));
}
function finding(id, over = {}) {
  return { id, origin: 'generalist', tag: 'blocking', problem: `p:${id}`, fix: `f:${id}`, ...over };
}
function writeReview(dir, n, findings, openBlocking) {
  writeJson(join(dir, `round-${n}.review.json`), {
    round: n,
    findings,
    openBlocking: openBlocking ?? findings.filter((f) => f.tag === 'blocking').length,
  });
}
function readLedger(dir) {
  return JSON.parse(readFileSync(join(dir, 'ledger.json'), 'utf8'));
}

test('empty ledger + 2 blocking + 1 nit -> 3 findings, b=2, continue', (t) => {
  const dir = scratch(t);
  writeReview(dir, 1, [finding('a'), finding('b'), finding('c', { tag: 'nit' })]);
  const r = runGuard({ scratchDir: dir, n: 1 });
  assert.equal(r.b, 2);
  assert.equal(r.verdict, 'continue');
  assert.equal(readLedger(dir).findings.length, 3);
});

test('finding missing origin or tag -> throws (fails closed)', (t) => {
  const dir = scratch(t);
  writeJson(join(dir, 'round-1.review.json'), {
    round: 1, openBlocking: 1,
    findings: [{ id: 'a', tag: 'blocking', problem: 'p', fix: 'f' }], // no origin
  });
  assert.throws(() => runGuard({ scratchDir: dir, n: 1 }), /origin|tag/);
});

test('malformed JSON -> throws', (t) => {
  const dir = scratch(t);
  writeFileSync(join(dir, 'round-1.review.json'), '{ not json');
  assert.throws(() => runGuard({ scratchDir: dir, n: 1 }));
});

test('recurring id with changed tag -> tag updated, tagHistory appended, origin/roundRaised preserved', (t) => {
  const dir = scratch(t);
  writeReview(dir, 1, [finding('a', { origin: 'db', tag: 'blocking' })]);
  runGuard({ scratchDir: dir, n: 1 });
  writeReview(dir, 2, [finding('a', { origin: 'db', tag: 'nit', tagReason: 'minor on reflection' })]);
  runGuard({ scratchDir: dir, n: 2 });
  const f = readLedger(dir).findings.find((x) => x.id === 'a');
  assert.equal(f.tag, 'nit');
  assert.equal(f.origin, 'db');
  assert.equal(f.roundRaised, 1);
  assert.equal(f.tagHistory.length, 2);
  assert.equal(f.tagHistory[1].tag, 'nit');
});

test('recurring id NOT re-emitted -> ledger tag unchanged (reconcile preservation)', (t) => {
  const dir = scratch(t);
  writeReview(dir, 1, [finding('a', { tag: 'nit' }), finding('b', { tag: 'blocking' })]);
  runGuard({ scratchDir: dir, n: 1 });
  writeReview(dir, 2, [finding('b', { tag: 'blocking' })]); // 'a' not re-emitted
  runGuard({ scratchDir: dir, n: 2 });
  const a = readLedger(dir).findings.find((x) => x.id === 'a');
  assert.equal(a.tag, 'nit');
  assert.equal(a.tagHistory.length, 1);
});

test('generalist down-tag leaves b(n) but keeps status open + records tagHistory', (t) => {
  const dir = scratch(t);
  writeReview(dir, 1, [finding('a', { origin: 'db', tag: 'blocking' })]);
  let r = runGuard({ scratchDir: dir, n: 1 });
  assert.equal(r.b, 1);
  writeReview(dir, 2, [finding('a', { origin: 'db', tag: 'nit', tagReason: 'design-time only' })]);
  r = runGuard({ scratchDir: dir, n: 2 });
  assert.equal(r.b, 0); // down-tag removed it from blocking count
  const a = readLedger(dir).findings.find((x) => x.id === 'a');
  assert.equal(a.status, 'open'); // tag action never touched status
  assert.equal(a.tagHistory.at(-1).by, 'generalist');
});

test('no rebuttal -> all merged findings stay open', (t) => {
  const dir = scratch(t);
  writeReview(dir, 1, [finding('a'), finding('b')]);
  runGuard({ scratchDir: dir, n: 1 });
  assert.ok(readLedger(dir).findings.every((f) => f.status === 'open'));
});

test('rebuttal resolved/wontfix drop from b(n) and set status', (t) => {
  const dir = scratch(t);
  writeReview(dir, 1, [finding('a'), finding('b'), finding('c')]);
  runGuard({ scratchDir: dir, n: 1 });
  writeReview(dir, 2, [finding('a'), finding('b'), finding('c')]);
  writeJson(join(dir, 'round-2.rebuttal.json'), {
    round: 2,
    statuses: { a: { status: 'resolved', note: 'fixed' }, b: { status: 'wontfix', note: 'declined' } },
  });
  const r = runGuard({ scratchDir: dir, n: 2 });
  assert.equal(r.b, 1); // only c still open-blocking
  const led = readLedger(dir);
  assert.equal(led.findings.find((f) => f.id === 'a').status, 'resolved');
  assert.equal(led.findings.find((f) => f.id === 'b').status, 'wontfix');
});

test('openBlocking divergence -> computed b authoritative, no throw', (t) => {
  const dir = scratch(t);
  writeReview(dir, 1, [finding('a'), finding('b')], 5); // claims 5, really 2
  const r = runGuard({ scratchDir: dir, n: 1 });
  assert.equal(r.b, 2);
});

test('b=0 -> converged', (t) => {
  const dir = scratch(t);
  writeReview(dir, 1, [finding('a', { tag: 'nit' })]);
  assert.equal(runGuard({ scratchDir: dir, n: 1 }).verdict, 'converged');
});

test('two consecutive non-progress reviews -> stalled (earliest 3rd review)', (t) => {
  const dir = scratch(t);
  writeReview(dir, 1, [finding('a'), finding('b'), finding('c')]); // b=3, best=3
  assert.equal(runGuard({ scratchDir: dir, n: 1 }).verdict, 'continue');
  writeReview(dir, 2, [finding('a'), finding('b'), finding('c')]); // b=3, non-progress (streak 1)
  assert.equal(runGuard({ scratchDir: dir, n: 2 }).verdict, 'continue');
  writeReview(dir, 3, [finding('a'), finding('b'), finding('c')]); // b=3, non-progress (streak 2)
  assert.equal(runGuard({ scratchDir: dir, n: 3 }).verdict, 'stalled');
});

// b only falls when a rebuttal resolves a blocker (an unmentioned blocker is
// preserved, not dropped) -- so progress is driven by rebuttals, as in the real loop.
function resolve(dir, n, ids) {
  writeJson(join(dir, `round-${n}.rebuttal.json`), {
    round: n, statuses: Object.fromEntries(ids.map((id) => [id, { status: 'resolved', note: 'fixed' }])),
  });
}

// The SKILL loop writes round-n's rebuttal at step 6, AFTER the round-n guard at
// step 4 -- so a rebuttal is never on disk for its own guard call and must be
// folded by a later one. The fixtures above pre-stage it, an ordering the live
// driver cannot produce; this one follows the real sequence.
test('rebuttal written after its own round is folded by the next guard run (live driver order)', (t) => {
  const dir = scratch(t);
  writeReview(dir, 1, [finding('a'), finding('b')]);
  assert.equal(runGuard({ scratchDir: dir, n: 1 }).b, 2);
  resolve(dir, 1, ['a']); // author revises and rebuts only after the guard has run
  writeReview(dir, 2, [finding('b')]);
  const r = runGuard({ scratchDir: dir, n: 2 });
  assert.equal(r.b, 1);
  assert.equal(readLedger(dir).findings.find((f) => f.id === 'a').status, 'resolved');
});

// The author owns `status`, but a reviewer re-raising a finding must be able to
// dispute the claim -- otherwise a review converges on the author's say-so and the
// adversarial filter is one-sided. A re-emission at round n overrides a rebuttal
// from an earlier round; `wontfix` is an author decision the guard never overrides.
test('re-emitting a resolved finding reopens it', (t) => {
  const dir = scratch(t);
  writeReview(dir, 1, [finding('a'), finding('b')]);
  runGuard({ scratchDir: dir, n: 1 });
  resolve(dir, 1, ['a']);
  writeReview(dir, 2, [finding('b')]); // 'a' not re-emitted -> stays resolved
  assert.equal(runGuard({ scratchDir: dir, n: 2 }).b, 1);
  writeReview(dir, 3, [finding('a'), finding('b')]); // reviewer disputes the fix
  assert.equal(runGuard({ scratchDir: dir, n: 3 }).b, 2);
  assert.equal(readLedger(dir).findings.find((f) => f.id === 'a').status, 'open');
});

test('re-emitting a wontfix finding does NOT reopen it, but a dispute yields `contested` not `converged`', (t) => {
  const dir = scratch(t);
  writeReview(dir, 1, [finding('a')]);
  runGuard({ scratchDir: dir, n: 1 });
  writeJson(join(dir, 'round-1.rebuttal.json'), {
    round: 1, statuses: { a: { status: 'wontfix', note: 'declined' } },
  });
  writeReview(dir, 2, [finding('a')]); // reviewer re-raises the sole wontfix -> disputed
  const r = runGuard({ scratchDir: dir, n: 2 });
  assert.equal(r.b, 0);
  assert.equal(r.verdict, 'contested'); // NOT converged: the dispute reaches the user
  assert.equal(readLedger(dir).findings.find((f) => f.id === 'a').status, 'wontfix'); // still the author's call
});

test('an undisputed wontfix converges (not re-emitted -> no dispute)', (t) => {
  const dir = scratch(t);
  writeReview(dir, 1, [finding('a')]);
  runGuard({ scratchDir: dir, n: 1 });
  writeJson(join(dir, 'round-1.rebuttal.json'), {
    round: 1, statuses: { a: { status: 'wontfix', note: 'declined' } },
  });
  writeReview(dir, 2, []); // reviewer accepts the wontfix by not re-raising it
  assert.equal(runGuard({ scratchDir: dir, n: 2 }).verdict, 'converged');
});

// The durability property the reopen fix must guarantee (correctness-1/db-1):
// once a dispute reopens a finding, a LATER round that simply omits its id --
// with no fresh rebuttal -- must NOT let the stale pre-reopen `resolved` replay.
test('a reopened finding stays open when a later round omits it (reopen is durable)', (t) => {
  const dir = scratch(t);
  writeReview(dir, 1, [finding('a'), finding('b')]);
  runGuard({ scratchDir: dir, n: 1 });
  resolve(dir, 1, ['a']); // author resolves a after guard 1
  writeReview(dir, 2, [finding('a'), finding('b')]); // reviewer disputes -> reopen
  assert.equal(runGuard({ scratchDir: dir, n: 2 }).b, 2);
  const a2 = readLedger(dir).findings.find((f) => f.id === 'a');
  assert.equal(a2.status, 'open');
  assert.equal(a2.reopenedAt, 2);
  assert.equal(a2.statusRound, undefined); // absent while open
  writeReview(dir, 3, [finding('b')]); // a omitted; NO round-2 rebuttal for it
  const r = runGuard({ scratchDir: dir, n: 3 });
  assert.equal(readLedger(dir).findings.find((f) => f.id === 'a').status, 'open'); // not reverted
  assert.equal(r.b, 2); // a still counted -- the dispute survives
});

// The complement: a rebuttal from the reopen round (or later) DOES re-settle,
// even if the next round omits the id -- distinguishing a fresh answer from the
// stale pre-reopen one the test above forbids.
test('a rebuttal at the reopen round re-settles a reopened finding', (t) => {
  const dir = scratch(t);
  writeReview(dir, 1, [finding('a'), finding('b')]);
  runGuard({ scratchDir: dir, n: 1 });
  resolve(dir, 1, ['a']);
  writeReview(dir, 2, [finding('a'), finding('b')]); // reopen at round 2
  assert.equal(runGuard({ scratchDir: dir, n: 2 }).b, 2);
  resolve(dir, 2, ['a']); // author answers the dispute after guard 2 (statusRound will be 2 == reopenedAt)
  writeReview(dir, 3, [finding('b')]); // reviewer accepts, omits a
  const r = runGuard({ scratchDir: dir, n: 3 });
  assert.equal(readLedger(dir).findings.find((f) => f.id === 'a').status, 'resolved'); // fresh answer sticks
  assert.equal(r.b, 1);
});

test('re-running guard at the same n is idempotent (ledger and verdict identical)', (t) => {
  const dir = scratch(t);
  writeReview(dir, 1, [finding('a'), finding('b'), finding('c')]);
  const r1 = runGuard({ scratchDir: dir, n: 1 });
  const ledger1 = JSON.stringify(readLedger(dir));
  const r1again = runGuard({ scratchDir: dir, n: 1 }); // crash/retry of the same round
  const ledger2 = JSON.stringify(readLedger(dir));
  assert.deepEqual(r1again, r1); // same verdict/b/best
  assert.equal(ledger2, ledger1); // no double-bumped roundsInCycle or streak
  assert.equal(readLedger(dir).meta.roundsInCycle, 1);
});

test('a rebuttal id with no ledger match is ignored, not applied to another finding', (t) => {
  const dir = scratch(t);
  writeReview(dir, 1, [finding('a')]);
  runGuard({ scratchDir: dir, n: 1 });
  writeJson(join(dir, 'round-1.rebuttal.json'), {
    round: 1, statuses: { typo_id: { status: 'resolved', note: 'meant a' } },
  });
  writeReview(dir, 2, [finding('a')]);
  assert.doesNotThrow(() => runGuard({ scratchDir: dir, n: 2 }));
  assert.equal(readLedger(dir).findings.find((f) => f.id === 'a').status, 'open'); // untouched by the orphan
});

// A finding reopened at round 2 and re-resolved by the round-2 rebuttal is back
// to resolved once round 3 omits it (b=0). The reopen-durability boundary itself
// is pinned by the two dedicated tests below; this guards the b=0 outcome.
test('a reopened-then-re-resolved finding is resolved once a later round omits it', (t) => {
  const dir = scratch(t);
  writeReview(dir, 1, [finding('a')]);
  runGuard({ scratchDir: dir, n: 1 });
  resolve(dir, 1, ['a']);
  writeReview(dir, 2, [finding('a')]);
  runGuard({ scratchDir: dir, n: 2 }); // reopens: rebuttal round 1 < review round 2
  resolve(dir, 2, ['a']); // author fixes it again (round-2 rebuttal == reopen round)
  writeReview(dir, 3, []); // reviewer drops it
  assert.equal(runGuard({ scratchDir: dir, n: 3 }).b, 0);
});

test('progress review resets the stall streak', (t) => {
  const dir = scratch(t);
  const emit = (n, ids) => writeReview(dir, n, ids.map((id) => finding(id)));
  emit(1, ['a', 'b', 'c']); // b=3, best=3
  runGuard({ scratchDir: dir, n: 1 });
  emit(2, ['a', 'b', 'c']); // b=3 non-progress streak1
  runGuard({ scratchDir: dir, n: 2 });
  resolve(dir, 2, ['c']); // author rebuts round 2 after its guard ran
  emit(3, ['a', 'b']); // b=2 progress -> streak reset
  assert.equal(runGuard({ scratchDir: dir, n: 3 }).verdict, 'continue');
  emit(4, ['a', 'b']); // b=2 non-progress streak1
  runGuard({ scratchDir: dir, n: 4 });
  emit(5, ['a', 'b']); // b=2 non-progress streak2 -> stalled
  assert.equal(runGuard({ scratchDir: dir, n: 5 }).verdict, 'stalled');
});

test('5 progressing rounds without converge -> cap', (t) => {
  const dir = scratch(t);
  // b = 5,4,3,2,1: the author resolves one blocker after each review, and the next
  // review re-emits only what is still open. (Re-emitting a resolved one would
  // reopen it -- that is the disputed-fix path, covered above, not this one.)
  let open = ['a', 'b', 'c', 'd', 'e'];
  writeReview(dir, 1, open.map((id) => finding(id)));
  assert.equal(runGuard({ scratchDir: dir, n: 1 }).verdict, 'continue'); // b=5 best=5
  for (let n = 2; n <= 5; n++) {
    const fixed = ['e', 'd', 'c', 'b'][n - 2];
    resolve(dir, n - 1, [fixed]); // author rebuts round n-1 after its guard ran
    open = open.filter((id) => id !== fixed);
    writeReview(dir, n, open.map((id) => finding(id)));
    const r = runGuard({ scratchDir: dir, n });
    if (n < 5) assert.equal(r.verdict, 'continue', `round ${n}`);
    else assert.equal(r.verdict, 'cap'); // b=1, roundsInCycle=5
  }
});

test('--new-cycle resets round count and best', (t) => {
  const dir = scratch(t);
  writeReview(dir, 1, [finding('a'), finding('b'), finding('c')]); // cycle1 best=3
  runGuard({ scratchDir: dir, n: 1 });
  writeReview(dir, 2, [finding('a'), finding('b')]); // b=2 progress
  runGuard({ scratchDir: dir, n: 2 });
  // new cycle: a single high-b review should be treated as first review (progress), best reset
  writeReview(dir, 3, [finding('a'), finding('b'), finding('c'), finding('d')]); // b=4
  const r = runGuard({ scratchDir: dir, n: 3, newCycle: true });
  assert.equal(r.verdict, 'continue'); // first review of new cycle is always progress
  const m = readLedger(dir).meta;
  assert.equal(m.cycle, 2);
  assert.equal(m.roundsInCycle, 1);
  assert.equal(m.best, 4);
});
