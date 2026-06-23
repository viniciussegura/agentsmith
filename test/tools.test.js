import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planToolInstall } from '../src/tools.js';

test('maps tools/<ai>/<rest> to .<ai>/<rest>', () => {
  const plan = planToolInstall(['tools/claude/skills/spec-review/SKILL.md']);
  assert.deepEqual(plan, [
    { src: 'tools/claude/skills/spec-review/SKILL.md', dest: '.claude/skills/spec-review/SKILL.md' },
  ]);
});

test('generalizes across ai names', () => {
  const plan = planToolInstall(['tools/gemini/commands/x.md']);
  assert.equal(plan[0].dest, '.gemini/commands/x.md');
});

test('normalizes backslash paths', () => {
  const plan = planToolInstall(['tools\\claude\\agents\\spec-specialist.md']);
  assert.equal(plan[0].dest, '.claude/agents/spec-specialist.md');
});

test('ignores paths that are not inside a tools/<ai>/ dir', () => {
  assert.deepEqual(planToolInstall(['tools/claude', 'README.md', 'tools']), []);
});

test('maps devtools/claude/<rest> to .claude/<rest>', () => {
  const plan = planToolInstall(['devtools/claude/skills/instruction-review/SKILL.md']);
  assert.deepEqual(plan, [
    { src: 'devtools/claude/skills/instruction-review/SKILL.md', dest: '.claude/skills/instruction-review/SKILL.md' },
  ]);
});

test('drops non-claude second segments under devtools/', () => {
  assert.deepEqual(planToolInstall([
    'devtools/triage-ui/server.mjs',
    'devtools/restructure/gate.mjs',
    'devtools/gemini/commands/x.md',
  ]), []);
});

test('maps a mixed tools/ + devtools/claude list, only those', () => {
  const plan = planToolInstall([
    'tools/claude/commands/review-board.md',
    'devtools/claude/commands/instruction-apply.md',
    'devtools/triage-ui/diff.mjs',
  ]);
  assert.deepEqual(plan.map((p) => p.dest), [
    '.claude/commands/review-board.md',
    '.claude/commands/instruction-apply.md',
  ]);
});
