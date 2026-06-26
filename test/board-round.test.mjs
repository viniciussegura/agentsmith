// test/board-round.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRound } from '../tools/claude/skills/code-review-board/board-round.mjs';
import { codeArgs, specArgs } from '../tools/claude/skills/code-review-board/round-args.mjs';

// Build a recording harness: captures every agent() call + supports parallel/phase/log.
function harness(routing = { lenses: ['security', 'db'], perLens: {} }) {
  const calls = [];
  const phases = [];
  const agent = async (prompt, opts = {}) => {
    calls.push({ prompt, opts });
    if (!opts.model) throw new Error(`dispatch without explicit model: ${opts.label}`);
    if (opts.schema) return routing;              // the plan/reduce structured return
    return `ok:${opts.label}`;
  };
  const parallel = (thunks) => Promise.all(thunks.map((t) => t()));
  const phase = (t) => phases.push(t);
  const log = () => {};
  return { agent, parallel, phase, log, calls, phases };
}

test('code round runs Review -> Verify -> Reduce -> Persist, every dispatch carries a model', async () => {
  const h = harness();
  await runRound({ agent: h.agent, parallel: h.parallel, phase: h.phase, log: h.log,
    args: codeArgs({ roundId: 'r1', store: '/p/s', subjectRef: 'base..HEAD', candidateLenses: ['security', 'db'] }) });
  assert.deepEqual(h.phases, ['Review', 'Verify', 'Reduce', 'Persist']);
  // two reviewers + two verifiers + persist  (no plan call in this task)
  assert.equal(h.calls.filter((c) => c.opts.label?.startsWith('review:')).length, 2);
  assert.equal(h.calls.filter((c) => c.opts.label?.startsWith('verify:')).length, 2);
  assert.ok(h.calls.some((c) => c.opts.label === 'persist:apply'));
  // code's two-step reduce: a pre-reduce CLI dispatch (persist.mjs summary) then a
  // PM reduce whose prompt restores the directive contract (pm-directive.json).
  assert.ok(h.calls.some((c) => c.opts.label === 'reduce:pre'), 'code runs a reduce:pre dispatch');
  const reduce = h.calls.find((c) => c.opts.label === 'reduce');
  assert.match(reduce.prompt, /pm-directive\.json/);
  // Task 2: reduce must still route to review-pm (rename to project-manager is Task 4, per §J)
  assert.equal(reduce.opts.agentType, 'review-pm', 'code reduce dispatches to review-pm agent');
});

test('spec round skips Verify (verify=false)', async () => {
  const h = harness({ lenses: ['security'], perLens: {} });
  await runRound({ agent: h.agent, parallel: h.parallel, phase: h.phase, log: h.log,
    args: { ...specArgs({ roundId: '1', scratch: '/p/x', subjectRef: 'spec.md', candidateLenses: ['security'] }) } });
  assert.ok(!h.phases.includes('Verify'), 'no Verify phase for spec');
  // spec's preReduceCmd is null -> no reduce:pre dispatch.
  assert.ok(!h.calls.some((c) => c.opts.label === 'reduce:pre'), 'no reduce:pre dispatch for spec');
});

test('a dispatch missing model throws (the in-driver assertion)', async () => {
  const h = harness();
  // wrap agent to drop the model on the persist call
  const agent = async (p, o = {}) => (o.label === 'persist:apply' ? h.agent(p, { ...o, model: undefined }) : h.agent(p, o));
  await assert.rejects(
    runRound({ agent, parallel: h.parallel, phase: h.phase, log: h.log,
      args: codeArgs({ roundId: 'r1', store: '/p/s', subjectRef: 'x', candidateLenses: ['security'] }) }),
    /dispatch without explicit model/,
  );
});
