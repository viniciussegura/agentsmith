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
