import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGuard } from '../tools/claude/skills/spec-review-board/guard.mjs';

function scratch() {
  return mkdtempSync(join(tmpdir(), 'sr-guard-'));
}
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

test('empty ledger + 2 blocking + 1 nit -> 3 findings, b=2, continue', () => {
  const dir = scratch();
  writeReview(dir, 1, [finding('a'), finding('b'), finding('c', { tag: 'nit' })]);
  const r = runGuard({ scratchDir: dir, n: 1 });
  assert.equal(r.b, 2);
  assert.equal(r.verdict, 'continue');
  assert.equal(readLedger(dir).findings.length, 3);
});

test('finding missing origin or tag -> throws (fails closed)', () => {
  const dir = scratch();
  writeJson(join(dir, 'round-1.review.json'), {
    round: 1, openBlocking: 1,
    findings: [{ id: 'a', tag: 'blocking', problem: 'p', fix: 'f' }], // no origin
  });
  assert.throws(() => runGuard({ scratchDir: dir, n: 1 }), /origin|tag/);
});

test('malformed JSON -> throws', () => {
  const dir = scratch();
  writeFileSync(join(dir, 'round-1.review.json'), '{ not json');
  assert.throws(() => runGuard({ scratchDir: dir, n: 1 }));
});

test('recurring id with changed tag -> tag updated, tagHistory appended, origin/roundRaised preserved', () => {
  const dir = scratch();
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

test('recurring id NOT re-emitted -> ledger tag unchanged (reconcile preservation)', () => {
  const dir = scratch();
  writeReview(dir, 1, [finding('a', { tag: 'nit' }), finding('b', { tag: 'blocking' })]);
  runGuard({ scratchDir: dir, n: 1 });
  writeReview(dir, 2, [finding('b', { tag: 'blocking' })]); // 'a' not re-emitted
  runGuard({ scratchDir: dir, n: 2 });
  const a = readLedger(dir).findings.find((x) => x.id === 'a');
  assert.equal(a.tag, 'nit');
  assert.equal(a.tagHistory.length, 1);
});

test('generalist down-tag leaves b(n) but keeps status open + records tagHistory', () => {
  const dir = scratch();
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

test('no rebuttal -> all merged findings stay open', () => {
  const dir = scratch();
  writeReview(dir, 1, [finding('a'), finding('b')]);
  runGuard({ scratchDir: dir, n: 1 });
  assert.ok(readLedger(dir).findings.every((f) => f.status === 'open'));
});

test('rebuttal resolved/wontfix drop from b(n) and set status', () => {
  const dir = scratch();
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

test('openBlocking divergence -> computed b authoritative, no throw', () => {
  const dir = scratch();
  writeReview(dir, 1, [finding('a'), finding('b')], 5); // claims 5, really 2
  const r = runGuard({ scratchDir: dir, n: 1 });
  assert.equal(r.b, 2);
});

test('b=0 -> converged', () => {
  const dir = scratch();
  writeReview(dir, 1, [finding('a', { tag: 'nit' })]);
  assert.equal(runGuard({ scratchDir: dir, n: 1 }).verdict, 'converged');
});

test('two consecutive non-progress reviews -> stalled (earliest 3rd review)', () => {
  const dir = scratch();
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

test('progress review resets the stall streak', () => {
  const dir = scratch();
  const all = [finding('a'), finding('b'), finding('c')];
  writeReview(dir, 1, all); // b=3, best=3
  runGuard({ scratchDir: dir, n: 1 });
  writeReview(dir, 2, all); // b=3 non-progress streak1
  runGuard({ scratchDir: dir, n: 2 });
  writeReview(dir, 3, all); resolve(dir, 3, ['c']); // b=2 progress -> streak reset
  assert.equal(runGuard({ scratchDir: dir, n: 3 }).verdict, 'continue');
  writeReview(dir, 4, all); // b=2 non-progress streak1
  runGuard({ scratchDir: dir, n: 4 });
  writeReview(dir, 5, all); // b=2 non-progress streak2 -> stalled
  assert.equal(runGuard({ scratchDir: dir, n: 5 }).verdict, 'stalled');
});

test('5 progressing rounds without converge -> cap', () => {
  const dir = scratch();
  const all = ['a', 'b', 'c', 'd', 'e'].map((id) => finding(id));
  // b = 5,4,3,2,1 by resolving one blocker per round (progress each round, never 0)
  writeReview(dir, 1, all);
  assert.equal(runGuard({ scratchDir: dir, n: 1 }).verdict, 'continue'); // b=5 best=5
  for (let n = 2; n <= 5; n++) {
    writeReview(dir, n, all);
    resolve(dir, n, [['e'], ['d'], ['c'], ['b']][n - 2]); // resolve one more each round
    const r = runGuard({ scratchDir: dir, n });
    if (n < 5) assert.equal(r.verdict, 'continue', `round ${n}`);
    else assert.equal(r.verdict, 'cap'); // b=1, roundsInCycle=5
  }
});

test('--new-cycle resets round count and best', () => {
  const dir = scratch();
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
