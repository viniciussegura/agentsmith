import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planToolInstall } from '../src/tools.js';

test('maps tools/<ai>/<rest> to .<ai>/<rest> (skills unprefixed)', () => {
  const plan = planToolInstall(['tools/claude/skills/spec-review-board/SKILL.md']);
  assert.deepEqual(plan, [
    { src: 'tools/claude/skills/spec-review-board/SKILL.md', dest: '.claude/skills/spec-review-board/SKILL.md' },
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
  const plan = planToolInstall(['devtools/claude/skills/instruction-review-board/SKILL.md']);
  assert.deepEqual(plan, [
    { src: 'devtools/claude/skills/instruction-review-board/SKILL.md', dest: '.claude/skills/instruction-review-board/SKILL.md' },
  ]);
});

test('drops non-claude second segments under devtools/', () => {
  assert.deepEqual(planToolInstall([
    'devtools/triage-ui/server.mjs',
    'devtools/restructure/gate.mjs',
    'devtools/gemini/commands/x.md',
  ]), []);
});

test('maps a mixed tools/ + devtools/claude list, only those (commands prefixed)', () => {
  const plan = planToolInstall([
    'tools/claude/commands/code-review-board.md',
    'devtools/claude/commands/instruction-apply.md',
    'devtools/triage-ui/diff.mjs',
  ]);
  assert.deepEqual(plan.map((p) => p.dest), [
    '.claude/commands/agentsmith-code-review-board.md',
    '.claude/commands/agentsmith-instruction-apply.md',
  ]);
});

test('claude commands get an agentsmith- prefix; skills and agents do not', () => {
  const plan = planToolInstall([
    'tools/claude/commands/spec-review-board.md',
    'tools/claude/commands/agentsmith-init.md',
    'tools/claude/skills/code-review-board/lint.mjs',
    'tools/claude/agents/review-swe.md',
    'tools/gemini/commands/x.md',
  ]);
  const dest = Object.fromEntries(plan.map((p) => [p.src, p.dest]));
  assert.equal(dest['tools/claude/commands/spec-review-board.md'], '.claude/commands/agentsmith-spec-review-board.md');
  // a name already starting with agentsmith is not doubled
  assert.equal(dest['tools/claude/commands/agentsmith-init.md'], '.claude/commands/agentsmith-init.md');
  // skills keep canonical names (internal script paths) and agents stay bare (dispatch names)
  assert.equal(dest['tools/claude/skills/code-review-board/lint.mjs'], '.claude/skills/code-review-board/lint.mjs');
  assert.equal(dest['tools/claude/agents/review-swe.md'], '.claude/agents/review-swe.md');
  // only the claude adapter is namespaced; other ai adapters stay bare
  assert.equal(dest['tools/gemini/commands/x.md'], '.gemini/commands/x.md');
});
