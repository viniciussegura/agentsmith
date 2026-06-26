// test/board-round.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRound } from '../tools/claude/skills/code-review-board/board-round.mjs';
import { codeArgs, specArgs, ROUTING_SCHEMA } from '../tools/claude/skills/code-review-board/round-args.mjs';

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

test('code round runs Plan -> Review -> Verify -> Reduce -> Persist, every dispatch carries a model', async () => {
  const h = harness();
  await runRound({ agent: h.agent, parallel: h.parallel, phase: h.phase, log: h.log,
    args: codeArgs({ roundId: 'r1', store: '/p/s', subjectRef: 'base..HEAD', candidateLenses: ['security', 'db'] }) });
  assert.deepEqual(h.phases, ['Plan', 'Review', 'Verify', 'Reduce', 'Persist']);
  // two maintainer-chosen reviewers + two verifiers + persist
  assert.equal(h.calls.filter((c) => c.opts.label?.startsWith('review:')).length, 2);
  assert.equal(h.calls.filter((c) => c.opts.label?.startsWith('verify:')).length, 2);
  assert.ok(h.calls.some((c) => c.opts.label === 'persist:apply'));
  // code's two-step reduce: a pre-reduce CLI dispatch (persist.mjs summary) then a
  // PM reduce whose prompt restores the directive contract (pm-directive.json).
  assert.ok(h.calls.some((c) => c.opts.label === 'reduce:pre'), 'code runs a reduce:pre dispatch');
  const reduce = h.calls.find((c) => c.opts.label === 'reduce');
  assert.match(reduce.prompt, /pm-directive\.json/);
  // the maintainer (plan + reduce) is the renamed project-manager agent.
  assert.equal(reduce.opts.agentType, 'project-manager', 'code reduce dispatches to project-manager agent');
});

test('code round with plan enabled fans out the maintainer-chosen lenses, not the candidate set', async () => {
  const h = harness({ lenses: ['security'], perLens: { security: { focus: 'authz' } } });
  const args = codeArgs({ roundId: 'r1', store: '/p/s', subjectRef: 'x', candidateLenses: ['security', 'db', 'qa'] });
  await runRound({ agent: h.agent, parallel: h.parallel, phase: h.phase, log: h.log, args });
  assert.ok(h.phases.includes('Plan'));
  assert.equal(h.calls.filter((c) => c.opts.label?.startsWith('review:')).length, 1, 'only the maintainer-chosen lens runs');
  assert.ok(h.calls.some((c) => c.opts.label === 'plan' && c.opts.schema));
  const plan = h.calls.find((c) => c.opts.label === 'plan');
  assert.equal(plan.opts.agentType, 'project-manager', 'plan dispatches to the project-manager maintainer');
});

test('spec round skips Verify (verify=false)', async () => {
  const h = harness({ lenses: ['security'], perLens: {} });
  await runRound({ agent: h.agent, parallel: h.parallel, phase: h.phase, log: h.log,
    args: { ...specArgs({ roundId: '1', scratch: '/p/x', subjectRef: 'spec.md', candidateLenses: ['security'] }) } });
  assert.ok(!h.phases.includes('Verify'), 'no Verify phase for spec');
  // spec's preReduceCmd is null -> no reduce:pre dispatch.
  assert.ok(!h.calls.some((c) => c.opts.label === 'reduce:pre'), 'no reduce:pre dispatch for spec');
});

test('spec round: plan, review, NO verify, reduce, guard persist; one round only', async () => {
  const h = harness({ lenses: ['security', 'qa'], perLens: {} });
  const args = { ...specArgs({ roundId: '1', scratch: '/p/x', subjectRef: 'spec.md', candidateLenses: ['security', 'qa'] }), plan: { routingSchema: ROUTING_SCHEMA } };
  const out = await runRound({ agent: h.agent, parallel: h.parallel, phase: h.phase, log: h.log, args });
  assert.ok(!h.phases.includes('Verify'));
  assert.equal(out.board, 'spec');
  assert.ok(h.calls.some((c) => c.opts.label === 'persist:apply' && /guard\.mjs/.test(c.prompt)));
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
