// test/round-context.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveContext, skillsRootOf } from '../tools/claude/skills/code-review-board/round-context.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(repo, 'tools', 'claude', 'skills', 'code-review-board', 'round-context.mjs');

test('a project carrying its own agents dispatches bare; one without them namespaces', () => {
  assert.equal(resolveContext({ hasProjectAgents: true, skillsDir: '/s', cwd: '/p' }).agentPrefix, '');
  assert.equal(resolveContext({ hasProjectAgents: false, skillsDir: '/s', cwd: '/p' }).agentPrefix, 'agentsmith:');
});

test('resolveContext passes the skills root and cwd through untouched', () => {
  const ctx = resolveContext({ hasProjectAgents: false, skillsDir: '/abs/skills', cwd: '/abs/worktree' });
  assert.deepEqual(ctx, { agentPrefix: 'agentsmith:', skillsDir: '/abs/skills', cwd: '/abs/worktree' });
});

test('skillsRootOf reports the directory holding the skill dirs, absolute', () => {
  const root = skillsRootOf(import.meta.url.replace('/test/round-context.test.mjs', '/tools/claude/skills/code-review-board/round-context.mjs'));
  assert.equal(root, resolve(repo, 'tools', 'claude', 'skills'));
});

// Run the CLI from `at` and parse its JSON. The cwd is the whole point: the prefix
// probe is a project-relative lookup, so the reported value must follow the caller.
function runAt(at) {
  const out = execFileSync(process.execPath, [SCRIPT], { cwd: at, encoding: 'utf8' });
  return JSON.parse(out);
}

test('the CLI reports a namespaced prefix from a project with no .claude/agents', () => {
  const at = mkdtempSync(join(tmpdir(), 'agentsmith-ctx-'));
  const ctx = runAt(at);
  assert.equal(ctx.agentPrefix, 'agentsmith:', 'no project agents -> bare names would not resolve');
  assert.equal(ctx.skillsDir, resolve(repo, 'tools', 'claude', 'skills'));
});

test('the CLI reports a bare prefix once the project carries the probe agent', () => {
  const at = mkdtempSync(join(tmpdir(), 'agentsmith-ctx-'));
  mkdirSync(join(at, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(at, '.claude', 'agents', 'review-swe.md'), '# review-swe\n');
  assert.equal(runAt(at).agentPrefix, '', 'a vendored install resolves bare names');
});

test('the reported skillsDir is absolute and independent of the running cwd', () => {
  const a = mkdtempSync(join(tmpdir(), 'agentsmith-ctx-'));
  const b = mkdtempSync(join(tmpdir(), 'agentsmith-ctx-'));
  const [one, two] = [runAt(a), runAt(b)];
  assert.equal(one.skillsDir, two.skillsDir, 'same skills root from two different cwds');
  assert.equal(resolve(one.skillsDir), one.skillsDir, 'absolute');
  // cwd IS reported, so a mismatch between where the caller stood and where a
  // relative path would have resolved is visible rather than deduced.
  assert.equal(resolve(one.cwd), resolve(a));
  assert.equal(resolve(two.cwd), resolve(b));
});
