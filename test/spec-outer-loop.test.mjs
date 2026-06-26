// test/spec-outer-loop.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runOuterLoop } from '../tools/claude/skills/code-review-board/round-args.mjs';

test('outer loop re-invokes the round until guard converges', async () => {
  const verdicts = ['continue', 'continue', 'converged'];
  let rounds = 0;
  const out = await runOuterLoop({
    roundFn: async () => { rounds += 1; },
    guardFn: async (n) => verdicts[n - 1],
    reviseFn: async () => {},
    cap: 5,
  });
  assert.equal(rounds, 3);
  assert.equal(out.verdict, 'converged');
});

test('outer loop stops at the cap', async () => {
  const out = await runOuterLoop({ roundFn: async () => {}, guardFn: async () => 'continue', reviseFn: async () => {}, cap: 5 });
  assert.equal(out.verdict, 'cap');
});
