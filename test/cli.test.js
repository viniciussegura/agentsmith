import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = resolve(fileURLToPath(import.meta.url), '../../bin/cli.js');

function run(cwd, args = []) {
  execFileSync('node', [cli, ...args], { cwd });
}

test('default run emits lean core, bundle, and a root stub', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    run(dir);
    assert.ok(existsSync(join(dir, '.agentsmith/AGENTS.md')), 'nested core written');
    assert.ok(existsSync(join(dir, '.agentsmith/agents/frontend.md')), 'bundle written');
    assert.ok(existsSync(join(dir, 'AGENTS.md')), 'root stub written');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('folder sections inline the core and emit a file per bundle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    run(dir);
    const core = readFileSync(join(dir, '.agentsmith/AGENTS.md'), 'utf8');
    assert.match(core, /#swe-reuse/, 'a core-section rule is inlined');
    assert.doesNotMatch(core, /#be-api-first/, 'a bundle-section rule is not inlined in the lean core');
    assert.ok(existsSync(join(dir, '.agentsmith/agents/frontend.md')), 'frontend bundle written');
    assert.ok(existsSync(join(dir, '.agentsmith/agents/backend.md')), 'backend bundle written');
    const backend = readFileSync(join(dir, '.agentsmith/agents/backend.md'), 'utf8');
    assert.match(backend, /#be-api-first/, 'a bundle-section rule lands in its bundle file');
    // #ai-instruction-review is an authoring-only on-demand bundle, not in the consumer core
    assert.doesNotMatch(core, /## #ai-instruction-review/, 'instruction-review rule is not defined in the lean core');
    const authoring = readFileSync(join(dir, '.agentsmith/agents/authoring.md'), 'utf8');
    assert.match(authoring, /## #ai-instruction-review/, 'instruction-review rule is defined in the authoring bundle');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an existing root AGENTS.md is never clobbered', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    const root = join(dir, 'AGENTS.md');
    writeFileSync(root, 'MY OWN POINTER\n');
    run(dir);
    assert.equal(readFileSync(root, 'utf8'), 'MY OWN POINTER\n', 'consumer file preserved');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('default run installs the claude adapter into .claude', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    run(dir);
    assert.ok(existsSync(join(dir, '.claude/agents/spec-specialist.md')), 'subagent installed');
    assert.ok(existsSync(join(dir, '.claude/skills/spec-review-board/SKILL.md')), 'skill installed');
    assert.ok(existsSync(join(dir, '.claude/commands/agentsmith-spec-review-board.md')), 'command installed');
    // the review-board adapter (reviewer personas, skill, commands)
    assert.ok(existsSync(join(dir, '.claude/agents/review-correctness.md')), 'a reviewer persona installed');
    assert.ok(existsSync(join(dir, '.claude/agents/review-pm.md')), 'pm reduce persona installed');
    assert.ok(existsSync(join(dir, '.claude/skills/code-review-board/SKILL.md')), 'review-board skill installed');
    assert.ok(existsSync(join(dir, '.claude/skills/code-review-board/lint.mjs')), 'review-board store linter installed');
    assert.ok(existsSync(join(dir, '.claude/skills/code-review-board/reviewer-common.md')), 'shared reviewer protocol installed');
    assert.ok(existsSync(join(dir, '.claude/commands/agentsmith-code-review-board.md')), 'review-board command installed');
    assert.ok(existsSync(join(dir, '.claude/commands/agentsmith-review-promote.md')), 'review-promote command installed');
    // the instruction-review adapter is authoring-only (--dev); see the dedicated
    // default-excludes / --dev-includes tests below.
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--no-tools skips the adapter install', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    run(dir, ['--no-tools']);
    assert.ok(existsSync(join(dir, '.agentsmith/AGENTS.md')), 'core still written');
    assert.ok(!existsSync(join(dir, '.claude/skills/spec-review-board/SKILL.md')), 'adapter not installed');
    assert.ok(!existsSync(join(dir, '.claude/skills/code-review-board/SKILL.md')), 'review-board adapter not installed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const IR = '.claude/skills/instruction-review-board/SKILL.md';
const SHIPPED = '.claude/commands/agentsmith-code-review-board.md';
const TRIAGE = '.triage-ui'; // a devtools/triage-ui leak would create this; must never appear

test('default install ships review-board but NOT the authoring tools', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    run(dir);
    assert.ok(existsSync(join(dir, SHIPPED)), 'shipped tool present');
    assert.ok(!existsSync(join(dir, IR)), 'authoring tool absent by default');
    assert.ok(!existsSync(join(dir, '.claude/commands/agentsmith-instruction-apply.md')), 'instruction-apply absent');
    assert.ok(!existsSync(join(dir, '.claude/agents/review-ai.md')), 'review-ai absent');
    assert.ok(!existsSync(join(dir, TRIAGE)), 'triage-ui never installed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--dev install adds the authoring tools alongside the shipped set', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    run(dir, ['--dev']);
    assert.ok(existsSync(join(dir, SHIPPED)), 'shipped tool still present');
    assert.ok(existsSync(join(dir, IR)), 'authoring skill present under --dev');
    assert.ok(existsSync(join(dir, '.claude/agents/instruction-editor.md')), 'instruction-editor present under --dev');
    assert.ok(!existsSync(join(dir, TRIAGE)), 'triage-ui still not installed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Run the CLI with HOME/USERPROFILE pointed at a throwaway home dir.
function runUser(cwd, home, args = []) {
  execFileSync('node', [cli, '--user', ...args], {
    cwd,
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
}

test('--user writes home instructions, installs the adapter, and wires CLAUDE.md', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  const home = mkdtempSync(join(tmpdir(), 'agentsmith-home-'));
  try {
    runUser(dir, home);
    assert.ok(existsSync(join(home, '.agentsmith/AGENTS.md')), 'home core written');
    assert.ok(existsSync(join(home, '.claude/skills/spec-review-board/SKILL.md')), 'adapter in home');
    const claudeMd = readFileSync(join(home, '.claude/CLAUDE.md'), 'utf8');
    assert.match(claudeMd, /agentsmith: generated user instructions/, 'import block present');
    assert.match(claudeMd, /@.*\.agentsmith\/AGENTS\.md/, 'import line present');
    assert.ok(!existsSync(join(dir, '.agentsmith/AGENTS.md')), 'nothing written to cwd');
    assert.ok(!existsSync(join(dir, 'AGENTS.md')), 'no cwd stub');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test('--user is idempotent: a second run does not duplicate the import block', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  const home = mkdtempSync(join(tmpdir(), 'agentsmith-home-'));
  try {
    runUser(dir, home);
    runUser(dir, home);
    const claudeMd = readFileSync(join(home, '.claude/CLAUDE.md'), 'utf8');
    const blocks = claudeMd.match(/agentsmith: generated user instructions/g) || [];
    assert.equal(blocks.length, 1, 'import block appears exactly once');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test('--user appends to an existing CLAUDE.md without clobbering it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  const home = mkdtempSync(join(tmpdir(), 'agentsmith-home-'));
  try {
    const claudeMd = join(home, '.claude/CLAUDE.md');
    mkdirSync(dirname(claudeMd), { recursive: true });
    writeFileSync(claudeMd, '# my own global rules\n');
    runUser(dir, home);
    const content = readFileSync(claudeMd, 'utf8');
    assert.match(content, /^# my own global rules\n/, 'existing content preserved');
    assert.match(content, /agentsmith: generated user instructions/, 'block appended');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test('--user --no-tools writes instructions and wiring but no adapter', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  const home = mkdtempSync(join(tmpdir(), 'agentsmith-home-'));
  try {
    runUser(dir, home, ['--no-tools']);
    assert.ok(existsSync(join(home, '.agentsmith/AGENTS.md')), 'home core written');
    assert.ok(existsSync(join(home, '.claude/CLAUDE.md')), 'CLAUDE.md wired');
    assert.ok(!existsSync(join(home, '.claude/skills/spec-review-board/SKILL.md')), 'no adapter');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test('an unrelated .claude file survives the install', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    const mine = join(dir, '.claude/my-skill.md');
    mkdirSync(dirname(mine), { recursive: true });
    writeFileSync(mine, 'MINE\n');
    run(dir);
    assert.equal(readFileSync(mine, 'utf8'), 'MINE\n', 'consumer .claude file preserved');
    assert.ok(existsSync(join(dir, '.claude/skills/spec-review-board/SKILL.md')), 'adapter still installed alongside');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a recorded orphan is pruned on the next run; an unrecorded consumer file survives', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    run(dir); // first run writes the manifest
    const mfPath = join(dir, '.agentsmith/.install-manifest.json');
    const mf = JSON.parse(readFileSync(mfPath, 'utf8'));

    // simulate a prior run having produced a file the CURRENT sources no longer do
    const ghost = join(dir, '.claude/commands/agentsmith-ghost.md');
    writeFileSync(ghost, 'ghost');
    mf.paths.push('.claude/commands/agentsmith-ghost.md');
    writeFileSync(mfPath, `${JSON.stringify(mf, null, 2)}\n`);

    // a consumer's own file, never in the manifest
    const mine = join(dir, '.claude/commands/my-own.md');
    writeFileSync(mine, 'mine');

    run(dir); // second run prunes the ghost, spares my-own

    assert.equal(existsSync(ghost), false, 'recorded orphan pruned');
    assert.equal(existsSync(mine), true, 'unrecorded consumer file survived');
    const after = JSON.parse(readFileSync(mfPath, 'utf8'));
    assert.ok(!after.paths.includes('.claude/commands/agentsmith-ghost.md'), 'ghost dropped from manifest');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('settings.json and the root AGENTS.md stub are never pruned', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    run(dir);
    run(dir); // a second run must not delete merge-target or write-once files
    assert.equal(existsSync(join(dir, '.claude/settings.json')), true, 'settings.json kept');
    assert.equal(existsSync(join(dir, 'AGENTS.md')), true, 'root stub kept');
    const mf = JSON.parse(readFileSync(join(dir, '.agentsmith/.install-manifest.json'), 'utf8'));
    assert.ok(!mf.paths.includes('.claude/settings.json'), 'settings.json not recorded');
    assert.ok(!mf.paths.includes('AGENTS.md'), 'root stub not recorded');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
