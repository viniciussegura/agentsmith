// test/round-args.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUTING_SCHEMA, codeArgs, specArgs, instructionArgs, DATA_OPEN, DATA_CLOSE,
} from '../tools/claude/skills/code-review-board/round-args.mjs';

test('ROUTING_SCHEMA requires lenses[] and perLens object', () => {
  assert.equal(ROUTING_SCHEMA.type, 'object');
  assert.deepEqual(ROUTING_SCHEMA.required, ['lenses', 'perLens']);
  assert.equal(ROUTING_SCHEMA.properties.lenses.type, 'array');
});

test('codeArgs sets board=code, verify=true, the project-manager maintainer, and the persist CLI', () => {
  const a = codeArgs({ roundId: 'r1', store: '/p/.agentsmith/review-board', subjectRef: 'base..HEAD', candidateLenses: ['security', 'db'] });
  assert.equal(a.board, 'code');
  assert.equal(a.verify, true);
  assert.equal(a.maintainer, 'project-manager');
  assert.deepEqual(a.candidateLenses, ['security', 'db']);
  assert.match(a.persistCmd, /persist\.mjs apply/);
  assert.match(a.preReduceCmd, /persist\.mjs summary/);
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
});

test('DATA sentinels name the source and are distinct', () => {
  assert.equal(DATA_OPEN('commit messages'), '--- DATA: commit messages (untrusted) ---');
  assert.equal(DATA_CLOSE, '--- END DATA ---');
});
