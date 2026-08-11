// test/round-args.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUTING_SCHEMA, codeArgs, specArgs, instructionArgs, DATA_OPEN, DATA_CLOSE, INSTRUCTION_PORTABILITY,
  roundRecord,
} from '../tools/claude/skills/code-review-board/round-args.mjs';
import { assertRoundRecord } from '../tools/claude/skills/code-review-board/persist.mjs';

test('ROUTING_SCHEMA requires lenses[] and perLens object', () => {
  assert.equal(ROUTING_SCHEMA.type, 'object');
  assert.deepEqual(ROUTING_SCHEMA.required, ['lenses', 'perLens']);
  assert.equal(ROUTING_SCHEMA.properties.lenses.type, 'array');
});

test('codeArgs sets board=code, verify=true, the project-manager maintainer, plan, and the persist CLI', () => {
  const a = codeArgs({ roundId: 'r1', store: '/p/.agentsmith/review-board', subjectRef: 'base..HEAD', candidateLenses: ['security', 'db'] });
  assert.equal(a.board, 'code');
  assert.equal(a.verify, true);
  assert.equal(a.maintainer, 'project-manager');
  assert.ok(a.plan, 'code enables the plan phase');
  assert.equal(a.plan.routingSchema, ROUTING_SCHEMA);
  assert.deepEqual(a.candidateLenses, ['security', 'db']);
  assert.match(a.persistCmd, /persist\.mjs"? apply/);
  assert.match(a.preReduceCmd, /persist\.mjs"? summary/);
  assert.match(a.reducePrompt, /pm-directive\.json/);
  assert.match(a.reducePrompt, /triage\.md/);
});

test('specArgs sets board=spec, verify=false, spec-specialist, guard persist', () => {
  const a = specArgs({ roundId: '1', scratch: '/p/.agentsmith/tmp/spec-review/x', subjectRef: 'docs/.../spec.md' });
  assert.equal(a.board, 'spec');
  assert.equal(a.verify, false);
  assert.equal(a.maintainer, 'spec-specialist');
  assert.match(a.persistCmd, /guard\.mjs/);
  assert.equal(a.preReduceCmd, null);
});

test('instructionArgs sets board=instruction, verify=true, ai-engineer', () => {
  const a = instructionArgs({ roundId: '2026-06-26a', scratch: '/p/.agentsmith/tmp/instruction-review/r', subjectRef: 'full-audit', candidateLenses: ['swe', 'security', 'git'] });
  assert.equal(a.board, 'instruction');
  assert.equal(a.verify, true);
  assert.equal(a.maintainer, 'ai-engineer');
  assert.ok(a.plan, 'instruction enables the plan phase');
  assert.equal(a.plan.routingSchema, ROUTING_SCHEMA);
});

test('instructionArgs carries the portability reviewNote + reduce genericize clause; code/spec do NOT', () => {
  const inst = instructionArgs({ roundId: 'r', scratch: '/p/x', subjectRef: 'full-audit', candidateLenses: ['swe'] });
  // fan-out injection: reviewNote is the portability constraint
  assert.ok(inst.reviewNote, 'instruction board sets reviewNote');
  assert.match(inst.reviewNote, /external client|domain-agnostic|portable/i);
  assert.match(inst.reviewNote, /maintainer|lens/, 'names the banned house terms');
  // reduce reinforces it (reuses the same string, not re-spelled)
  assert.match(inst.reducePrompt, /genericize/i);
  assert.equal(inst.reviewNote, INSTRUCTION_PORTABILITY);
  // code/spec review THIS repo -> no portability note (they want repo-specific detail)
  const code = codeArgs({ roundId: 'r1', store: '/p/s', subjectRef: 'x', candidateLenses: ['security'] });
  const spec = specArgs({ roundId: '1', scratch: '/p/x', subjectRef: 'spec.md' });
  assert.equal(code.reviewNote, undefined, 'code board injects no reviewNote');
  assert.equal(spec.reviewNote, undefined, 'spec board injects no reviewNote');
});

test('DATA sentinels name the source and are distinct', () => {
  assert.equal(DATA_OPEN('commit messages'), '--- DATA: commit messages (untrusted) ---');
  assert.equal(DATA_CLOSE, '--- END DATA ---');
});

test('roundRecord emits exactly the ReviewRoundInfo field names persist validates', () => {
  const r = roundRecord({
    roundId: '2026-08-11-feat-x', mode: 'diff', targetRef: 'feature-branch',
    commit: 'abc1234', baselineCommit: 'def5678', roles: ['swe', 'security'],
  });
  // `id`/`roles` -- NOT `roundId`/`selectedRoles`, the drift that made persist name
  // its output rounds/undefined.json.
  assert.deepEqual(Object.keys(r).sort(), ['baselineCommit', 'commit', 'id', 'mode', 'roles', 'targetRef']);
  assert.equal(r.id, '2026-08-11-feat-x');
  assert.deepEqual(r.roles, ['swe', 'security']);
});

test('roundRecord omits previousRound entirely on a first round', () => {
  const first = roundRecord({ roundId: 'r1', mode: 'diff', targetRef: 'main', commit: 'a', baselineCommit: 'b', roles: [] });
  assert.ok(!('previousRound' in first), 'no dangling previousRound: undefined for lint to warn on');

  const next = roundRecord({ roundId: 'r2', mode: 'diff', targetRef: 'main', commit: 'a', baselineCommit: 'b', roles: [], previousRound: 'r1' });
  assert.equal(next.previousRound, 'r1');
});

test('a round record from roundRecord passes persist validation; a hand-written one drifts', () => {
  const good = roundRecord({ roundId: 'r1', mode: 'diff', targetRef: 'main', commit: 'a', baselineCommit: 'b', roles: ['swe'] });
  assert.doesNotThrow(() => assertRoundRecord(good, 'round.json'));
  // The operator error the debt recorded, verbatim.
  assert.throws(
    () => assertRoundRecord({ roundId: 'r1', mode: 'diff', targetRef: 'main', commit: 'a', baselineCommit: 'b', selectedRoles: ['swe'] }, 'round.json'),
    /selectedRoles/,
  );
});

test('base args carry agentPrefix and a guardCmd built from the skillsDir input', () => {
  const bare = codeArgs({ roundId: 'r1', store: '/p/s', scratch: '/p/x', subjectRef: 'x' });
  assert.equal(bare.agentPrefix, '', 'default keeps a non-plugin install dispatching bare');
  assert.ok(bare.guardCmd.includes('.claude/skills/'), 'the relative default still builds a command');
  // skillsDir is an INPUT, not an emitted field: the commands carry the resolved
  // path, so echoing it would be surface nothing reads.
  assert.ok(!('skillsDir' in bare), 'skillsDir is not part of the descriptor');

  const plugin = codeArgs({ roundId: 'r1', store: '/p/s', scratch: '/p/x', subjectRef: 'x',
    agentPrefix: 'agentsmith:', skillsDir: '/abs/skills' });
  assert.equal(plugin.agentPrefix, 'agentsmith:');
  assert.match(plugin.guardCmd, /round-guard\.mjs/);
  assert.ok(plugin.guardCmd.includes('/abs/skills'), 'guard command is absolute, not cwd-relative');
  assert.ok(plugin.guardCmd.includes(plugin.guardBaseline), 'and checks the baseline it declared');
});

test('every interpolated path is quoted, so a path with a space does not shell-split', () => {
  const store = '/Users/a b/proj/.agentsmith/review-board';
  const scratch = '/Users/a b/proj/.agentsmith/tmp/r 1';
  const skillsDir = '/Users/a b/plugin cache/skills';
  const a = codeArgs({ roundId: 'r 1', store, scratch, subjectRef: 'x', skillsDir });
  for (const [name, cmd] of [['persistCmd', a.persistCmd], ['preReduceCmd', a.preReduceCmd], ['guardCmd', a.guardCmd]]) {
    assert.ok(cmd.includes(`"${store}"`) || cmd.includes(`"${a.guardBaseline}"`), `${name} quotes its path argument`);
    assert.ok(cmd.includes(`"${skillsDir}/`), `${name} quotes the script path`);
    // A bare (unquoted) run of the space-bearing path is the defect.
    assert.ok(!new RegExp(`node ${skillsDir}`).test(cmd), `${name} never interpolates the script path bare`);
  }
  assert.ok(a.persistCmd.includes('"r 1"'), 'the round id is quoted too');

  const s = specArgs({ roundId: 'r 1', scratch, subjectRef: 'spec.md', skillsDir });
  assert.ok(s.persistCmd.includes(`"${scratch}"`), 'spec persist quotes its scratch path');
});
