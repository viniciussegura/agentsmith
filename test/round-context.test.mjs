// test/round-context.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveContext, skillsRootOf, probeLocations } from '../tools/claude/skills/code-review-board/round-context.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(repo, 'tools', 'claude', 'skills', 'code-review-board', 'round-context.mjs');

test('a bare name that resolves dispatches bare; one that does not gets the namespace', () => {
  assert.equal(resolveContext({ bareResolves: true, skillsDir: '/s', cwd: '/p' }).agentPrefix, '');
  assert.equal(resolveContext({ bareResolves: false, skillsDir: '/s', cwd: '/p' }).agentPrefix, 'agentsmith:');
});

test('resolveContext passes the skills root and cwd through untouched', () => {
  const ctx = resolveContext({ bareResolves: false, skillsDir: '/abs/skills', cwd: '/abs/worktree' });
  assert.deepEqual(ctx, { agentPrefix: 'agentsmith:', skillsDir: '/abs/skills', cwd: '/abs/worktree' });
});

test('skillsRootOf reports the directory holding the skill dirs, absolute', () => {
  const root = skillsRootOf(import.meta.url.replace('/test/round-context.test.mjs', '/tools/claude/skills/code-review-board/round-context.mjs'));
  assert.equal(root, resolve(repo, 'tools', 'claude', 'skills'));
});

// Run the CLI from `at` with `home` as the user root, and parse its JSON.
//
// The home override is not optional scaffolding: the probe reads homedir(), so a
// test using the developer's real HOME passes or fails on whether THEY happen to
// have run `agentsmith install --scope user`. Every CLI case below is hermetic.
function runAt(at, home) {
  const out = execFileSync(process.execPath, [SCRIPT], {
    cwd: at, encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  return JSON.parse(out);
}

// A temp cwd and a temp home, both removed afterwards -- the other two CLI test
// files in this repo clean up, and these would otherwise leave two dirs per test.
function inTempDirs(fn) {
  const at = mkdtempSync(join(tmpdir(), 'agentsmith-ctx-'));
  const home = mkdtempSync(join(tmpdir(), 'agentsmith-home-'));
  try {
    return fn(at, home);
  } finally {
    rmSync(at, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

// Drop `<root>/.claude/agents/review-swe.md`, the probe target.
function seedAgent(root) {
  mkdirSync(join(root, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(root, '.claude', 'agents', 'review-swe.md'), '# review-swe\n');
}

test('the CLI reports a namespaced prefix when neither location carries agents', () => {
  inTempDirs((at, home) => {
    const ctx = runAt(at, home);
    assert.equal(ctx.agentPrefix, 'agentsmith:', 'nothing bare to resolve -> namespace');
    assert.equal(ctx.skillsDir, resolve(repo, 'tools', 'claude', 'skills'));
  });
});

test('the CLI reports a bare prefix once the project carries the probe agent', () => {
  inTempDirs((at, home) => {
    seedAgent(at);
    assert.equal(runAt(at, home).agentPrefix, '', 'a project-scope install resolves bare names');
  });
});

// `agentsmith install --scope user` bases at homedir(), so its agents land at
// ~/.claude/agents/ and Claude Code resolves them BARE from any project. Probing
// only cwd would report `agentsmith:` there and every dispatch would die with
// `agent type not found` -- the exact failure this whole context probe exists to
// prevent, relocated to a different install shape. Both locations are checked, so
// each needs its own case: one test cannot show that both are consulted.
test('probeLocations covers the project AND the user home', () => {
  const at = '/some/project';
  const home = '/some/home';
  const found = probeLocations({ cwd: at, home });
  // Membership, not order: the consumer is `.some()`, so listing order carries no
  // meaning and asserting it would pin a property nothing depends on.
  assert.equal(found.length, 2, 'exactly the two locations, no more');
  for (const root of [at, home]) {
    assert.ok(found.includes(join(root, '.claude', 'agents', 'review-swe.md')), `${root} probed`);
  }
});

test('a user-scope install dispatches bare from a project that has no agents of its own', () => {
  inTempDirs((at, home) => {
    seedAgent(home);
    assert.equal(runAt(at, home).agentPrefix, '', 'user-scope agents resolve bare from any project');
  });
});

test('agents in both locations still dispatch bare', () => {
  inTempDirs((at, home) => {
    seedAgent(at);
    seedAgent(home);
    assert.equal(runAt(at, home).agentPrefix, '', 'bare resolves, so bare is used');
  });
});

test('the reported skillsDir is absolute and independent of the running cwd', () => {
  inTempDirs((a, home) => inTempDirs((b) => {
    const [one, two] = [runAt(a, home), runAt(b, home)];
    assert.equal(one.skillsDir, two.skillsDir, 'same skills root from two different cwds');
    assert.equal(resolve(one.skillsDir), one.skillsDir, 'absolute');
    // cwd IS reported, so a mismatch between where the caller stood and where a
    // relative path would have resolved is visible rather than deduced.
    assert.equal(resolve(one.cwd), resolve(a));
    assert.equal(resolve(two.cwd), resolve(b));
  }));
});
