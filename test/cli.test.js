import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, existsSync, writeFileSync, readFileSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '../test-helpers/tmp-dir.mjs';
import { buildOutputs } from '../src/build.js';
import { resolveSections } from '../src/sections.js';
import { sourceRevision } from '../src/revision.js';
import { makeListModules } from '../bin/cli.js';

const cli = resolve(fileURLToPath(import.meta.url), '../../bin/cli.js');
const pkgRoot = resolve(cli, '../..');

function run(cwd, args = []) {
  execFileSync('node', [cli, 'install', ...args], { cwd });
}

test('bin runs when launched through a .bin-style symlink (npx/global entry guard)', (t) => {
  // npm installs the bin as a symlink and Node realpaths import.meta.url; the entry
  // guard must realpath process.argv[1] too or main() silently never runs (exit 0).
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-link-'));
  const link = join(dir, 'agentsmith');
  try {
    try { symlinkSync(cli, link); }
    catch { t.skip('symlink creation unavailable (needs privilege on this platform)'); return; }
    const out = execFileSync('node', [link, '--version'], { encoding: 'utf8' });
    assert.match(out, /\d+\.\d+\.\d+/, 'main() ran through the symlink -- version printed, not a silent exit 0');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

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
    assert.ok(existsSync(join(dir, '.claude/agents/project-manager.md')), 'pm maintainer persona installed');
    assert.ok(existsSync(join(dir, '.claude/skills/code-review-board/SKILL.md')), 'review-board skill installed');
    assert.ok(existsSync(join(dir, '.claude/skills/code-review-board/lint.mjs')), 'review-board store linter installed');
    assert.ok(existsSync(join(dir, '.claude/skills/code-review-board/reviewer-common.md')), 'shared reviewer protocol installed');
    assert.ok(existsSync(join(dir, '.claude/commands/agentsmith-code-review-board.md')), 'review-board command installed');
    assert.ok(existsSync(join(dir, '.claude/commands/agentsmith-review-promote.md')), 'review-promote command installed');
    // plugin-only lifecycle commands are NOT written by the CLI (they would prune
    // their own adapters; the plugin ships them instead).
    assert.ok(!existsSync(join(dir, '.claude/commands/agentsmith-update-instructions.md')), 'update-instructions not CLI-installed');
    assert.ok(!existsSync(join(dir, '.claude/commands/agentsmith-remove-instructions.md')), 'remove-instructions not CLI-installed');
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
    assert.ok(existsSync(join(dir, '.claude/agents/ai-engineer.md')), 'ai-engineer present under --dev');
    assert.ok(!existsSync(join(dir, TRIAGE)), 'triage-ui still not installed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Run the CLI with HOME/USERPROFILE pointed at a throwaway home dir.
function runUser(cwd, home, args = []) {
  execFileSync('node', [cli, 'install', '--scope', 'user', ...args], {
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

test('an unknown flag exits non-zero (bug 2: ----no-tools must not silently full-install)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    assert.throws(() => execFileSync('node', [cli, 'install', '----no-tools'], { cwd: dir, stdio: 'ignore' }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('install --no-tools removes the stale settings hook (bug 1)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    run(dir);                                   // full install: hook present
    run(dir, ['--no-tools']);                   // prunes script AND un-merges entry
    const s = JSON.parse(readFileSync(join(dir, '.claude/settings.json'), 'utf8'));
    assert.ok(!JSON.stringify(s).includes('/hooks/agentsmith/'), 'stale hook entry removed');
    assert.ok(!existsSync(join(dir, '.claude/hooks/agentsmith/require-explicit-model.mjs')), 'hook script pruned');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('uninstall removes the CLI install (files, settings hook, manifest)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    run(dir);
    execFileSync('node', [cli, 'uninstall', '--yes'], { cwd: dir });
    assert.ok(!existsSync(join(dir, '.agentsmith/AGENTS.md')), 'core removed');
    assert.ok(!existsSync(join(dir, '.claude/skills/spec-review-board/SKILL.md')), 'adapter removed');
    assert.ok(!existsSync(join(dir, '.agentsmith/.install-manifest.json')), 'manifest removed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('uninstall off a TTY without --yes aborts non-zero (safety floor)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    run(dir);
    assert.throws(() => execFileSync('node', [cli, 'uninstall'], { cwd: dir, stdio: 'ignore' }));
    assert.ok(existsSync(join(dir, '.agentsmith/AGENTS.md')), 'still present after refused uninstall');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('install --clean recovers from a stale manifest (drops orphans)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    run(dir);
    const orphan = join(dir, '.claude/commands/agentsmith-ghost.md');
    writeFileSync(orphan, 'ghost');
    const mfPath = join(dir, '.agentsmith/.install-manifest.json');
    const mf = JSON.parse(readFileSync(mfPath, 'utf8')); mf.paths.push('.claude/commands/agentsmith-ghost.md');
    writeFileSync(mfPath, `${JSON.stringify(mf, null, 2)}\n`);
    execFileSync('node', [cli, 'install', '--clean', '--yes'], { cwd: dir });
    assert.ok(!existsSync(orphan), 'orphan gone after clean');
    assert.ok(existsSync(join(dir, '.agentsmith/AGENTS.md')), 'fresh install present');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('uninstall --scope user removes the CLAUDE.md import block, preserving user content', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  const home = mkdtempSync(join(tmpdir(), 'agentsmith-home-'));
  try {
    const claudeMd = join(home, '.claude/CLAUDE.md');
    mkdirSync(dirname(claudeMd), { recursive: true });
    writeFileSync(claudeMd, '# my own global rules\n');
    runUser(dir, home); // install --scope user wires the import
    assert.match(readFileSync(claudeMd, 'utf8'), /agentsmith: generated user instructions/, 'import present after install');

    execFileSync('node', [cli, 'uninstall', '--scope', 'user', '--yes'], {
      cwd: dir, env: { ...process.env, HOME: home, USERPROFILE: home },
    });
    const after = readFileSync(claudeMd, 'utf8');
    assert.doesNotMatch(after, /agentsmith: generated user instructions/, 'import block removed on uninstall');
    assert.match(after, /^# my own global rules/m, 'user content preserved');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test('--scope <PATH> installs into that explicit directory, not cwd', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    const target = join(dir, 'target-proj');
    mkdirSync(target, { recursive: true });
    execFileSync('node', [cli, 'install', '--scope', target], { cwd: dir });
    assert.ok(existsSync(join(target, '.agentsmith/AGENTS.md')), 'core written under the path scope');
    assert.ok(!existsSync(join(dir, '.agentsmith/AGENTS.md')), 'nothing written to cwd');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--scope pointing at a file (not a directory) errors non-zero', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    const filePath = join(dir, 'a-file.txt');
    writeFileSync(filePath, 'x');
    assert.throws(() => execFileSync('node', [cli, 'install', '--scope', filePath], { cwd: dir, stdio: 'ignore' }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('install --dry-run in a fresh dir writes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    execFileSync('node', [cli, 'install', '--dry-run'], { cwd: dir });
    assert.equal(existsSync(join(dir, '.agentsmith')), false, 'no .agentsmith written');
    assert.equal(existsSync(join(dir, '.claude')), false, 'no .claude written');
    assert.equal(existsSync(join(dir, 'AGENTS.md')), false, 'no root stub written');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('install/uninstall never touch a simulated plugin-cache path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    const pluginFile = join(dir, '.claude/plugins/marketplaces/agentsmith/SKILL.md');
    mkdirSync(dirname(pluginFile), { recursive: true }); writeFileSync(pluginFile, 'PLUGIN');
    run(dir);
    execFileSync('node', [cli, 'uninstall', '--yes'], { cwd: dir });
    assert.equal(readFileSync(pluginFile, 'utf8'), 'PLUGIN', 'plugin cache untouched by install+uninstall');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


// --- .agentsmith/docs-layout.yaml: the CLI properties (C1-C3, C5, C6, C9) -------
// Project-dependent rule content: see the design decision `project-dependent-rule-content`.

const CONFIG_REL = '.agentsmith/docs-layout.yaml';
const CONFIG_HELP_LINE = 'reads .agentsmith/docs-layout.yaml to remap the docs layout; see README';
const PLAN_MARKER = 'agentsmith plan:';
// A value chosen not to occur in any message text, so the no-echo assertion cannot
// be satisfied by a message that legitimately names a field, a tag or a rule word.
const NEVER_IN_A_MESSAGE = 'zzqx-offending-value';

// Spawn env built from a whitelist rather than inherited, so `--scope user` can
// never reach the real ~/.agentsmith and no host git config can change a result.
// GIT_CONFIG_NOSYSTEM is preferred over GIT_CONFIG_SYSTEM, which needs git >= 2.32.
function isolatedEnv(t, home) {
  const gitConfig = join(makeTempDir(t, 'agentsmith-gitcfg-'), 'gitconfig');
  writeFileSync(gitConfig, '');
  const env = { HOME: home, USERPROFILE: home, GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: '1' };
  // Carried through because a child node (and git) needs them on some platforms;
  // none of them can redirect the config read or the probe.
  for (const key of ['PATH', 'Path', 'SystemRoot', 'windir', 'SystemDrive', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR']) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
}

function writeConfig(base, text) {
  const file = join(base, CONFIG_REL);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}

// A launchable copy of the package, so a test can vary the rule sources without
// touching the repo. It sits outside any git repo, so sourceRevision takes its
// documented no-git fallback identically in the child and in an in-process reference.
const PKG_ENTRIES = ['bin', 'src', 'instructions', 'manifest.json', 'package.json'];
function copyPackage(t) {
  const dir = makeTempDir(t, 'agentsmith-pkg-');
  for (const entry of PKG_ENTRIES) cpSync(join(pkgRoot, entry), join(dir, entry), { recursive: true });
  return dir;
}

// Remove the external-note block from a rule module, line-based and deliberately
// independent of src/docslayout.js: this is C1's reference side, derived from the
// current source rather than frozen as a committed snapshot of a live rule module.
const NOTE_OPEN = '<!-- agentsmith:external-note -->';
const NOTE_CLOSE = '<!-- /agentsmith:external-note -->';
function withoutNoteBlock(text) {
  const lines = text.split('\n');
  const open = lines.findIndex((l) => l.startsWith(NOTE_OPEN));
  const close = lines.findIndex((l) => l.startsWith(NOTE_CLOSE));
  if (open === -1 || close < open) return text;
  const from = open > 0 && lines[open - 1] === '' ? open - 1 : open;
  return [...lines.slice(0, from), ...lines.slice(close + 1)].join('\n');
}

const NO_CONFIG_ARGS = ['install', '--no-tools', '--yes'];

test('C1: with no config, install writes exactly what a tree without the note block writes', (t) => {
  const pkg = copyPackage(t);
  const dir = makeTempDir(t, 'agentsmith-c1-');
  const home = makeTempDir(t, 'agentsmith-home-');

  const ruleRel = 'instructions/core/swe/swe-docs-layout.md';
  const ruleText = readFileSync(join(pkg, ruleRel), 'utf8');
  assert.notEqual(withoutNoteBlock(ruleText), ruleText, 'the rule source carries the note block -- else this proves nothing');

  execFileSync(process.execPath, [join(pkg, 'bin/cli.js'), ...NO_CONFIG_ARGS], { cwd: dir, env: isolatedEnv(t, home) });
  assert.ok(!existsSync(join(dir, CONFIG_REL)), 'install never writes the config itself');

  // Reference: the same tree, block removed, assembled by buildOutputs -- which the
  // transform never reaches, since it is applied to the module texts handed to it.
  const mf = JSON.parse(readFileSync(join(pkg, 'manifest.json'), 'utf8'));
  const pkgVersion = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).version;
  const { coreModules, bundles } = resolveSections({ sections: mf.sections, listModules: makeListModules(pkg) });
  const { commit, date } = sourceRevision({ pkgRoot: pkg, pkgVersion });
  const stripped = (rel) => withoutNoteBlock(readFileSync(join(pkg, rel), 'utf8'));
  const reference = buildOutputs({
    preamble: readFileSync(join(pkg, mf.preamble), 'utf8'),
    modules: coreModules.map(({ path, demote }) => ({ text: stripped(path), demote })),
    bundles: bundles.map((b) => ({
      name: b.name,
      title: b.title,
      when: b.when,
      modules: b.modules.map(({ path, demote }) => ({ text: stripped(path), demote })),
    })),
    source: mf.source,
    commit,
    date,
    layout: 'lean',
    placement: 'nested',
    output: mf.output,
  });

  assert.equal(readFileSync(join(dir, reference.corePath), 'utf8'), reference.coreContent, 'core file byte-identical');
  assert.ok(reference.bundles.length > 0, 'the comparison covers at least one bundle');
  for (const bundle of reference.bundles) {
    assert.equal(readFileSync(join(dir, bundle.path), 'utf8'), bundle.content, `bundle byte-identical: ${bundle.path}`);
  }
  assert.equal(readFileSync(join(dir, reference.stub.path), 'utf8'), reference.stub.content, 'stub byte-identical');
  assert.ok(!reference.coreContent.includes(NOTE_OPEN), 'no marker reaches the emitted core');
});

test('C2: a malformed config exits 1 before any write and before any plan', (t) => {
  const dir = makeTempDir(t, 'agentsmith-c2-');
  const home = makeTempDir(t, 'agentsmith-home-');
  writeConfig(dir, [
    'rows:',
    '  swe-design-decisions:',
    `    path: /${NEVER_IN_A_MESSAGE}/<decision-slug>.md`,
    '',
  ].join('\n'));

  const r = spawnSync(process.execPath, [cli, ...NO_CONFIG_ARGS], { cwd: dir, env: isolatedEnv(t, home), encoding: 'utf8' });

  assert.equal(r.status, 1, 'exit 1');
  assert.match(r.stderr, /\.agentsmith\/docs-layout\.yaml:3:/, 'the message locates the file and the offending line');
  assert.match(r.stderr, /no output was generated/, 'the message says no output was generated');
  assert.ok(!r.stderr.includes(NEVER_IN_A_MESSAGE), 'no fragment of the offending value on stderr');
  assert.ok(!r.stdout.includes(NEVER_IN_A_MESSAGE), 'no fragment of the offending value on stdout');
  assert.ok(!r.stderr.includes(PLAN_MARKER), 'no plan printed');
  assert.ok(!existsSync(join(dir, '.agentsmith/AGENTS.md')), 'no core written');
  assert.ok(!existsSync(join(dir, 'AGENTS.md')), 'no stub written');
  assert.ok(!existsSync(join(dir, '.agentsmith/agents')), 'no bundles written');
  assert.ok(!existsSync(join(dir, '.agentsmith/.install-manifest.json')), 'no manifest written');
});

test('C3: a config present while no module defines the rule exits 1', (t) => {
  const pkg = copyPackage(t);
  const dir = makeTempDir(t, 'agentsmith-c3-');
  const home = makeTempDir(t, 'agentsmith-home-');

  // Rename the rule's own tag: the table still parses, but nothing self-selects, so
  // every override would be silently dropped -- the failure this feature removes.
  const rule = join(pkg, 'instructions/core/swe/swe-docs-layout.md');
  const renamed = readFileSync(rule, 'utf8').replace('# #swe-docs-layout ', '# #swe-docs-elsewhere ');
  assert.ok(renamed.includes('#swe-docs-elsewhere'), 'the heading tag was actually renamed');
  writeFileSync(rule, renamed);
  writeConfig(dir, 'rows:\n  swe-design-decisions:\n    path: docs/adr/<decision-slug>.md\n');

  const r = spawnSync(process.execPath, [join(pkg, 'bin/cli.js'), ...NO_CONFIG_ARGS], { cwd: dir, env: isolatedEnv(t, home), encoding: 'utf8' });

  assert.equal(r.status, 1, 'exit 1');
  assert.match(r.stderr, /#swe-docs-layout rule is not in the generated instruction set/, 'the message says the rule was not found');
  assert.match(r.stderr, /no output was generated/, 'the message says no output was generated');
  assert.ok(!r.stderr.includes(PLAN_MARKER), 'no plan printed');
  assert.ok(!existsSync(join(dir, '.agentsmith/AGENTS.md')), 'no core written');
});

test('C5: --scope user reads the config under the redirected home, not the cwd', (t) => {
  const dir = makeTempDir(t, 'agentsmith-c5-');
  const home = makeTempDir(t, 'agentsmith-home-');
  writeConfig(home, 'rows:\n  swe-design-decisions:\n    path: docs/adr/<decision-slug>.md\n');
  // A config in the cwd that would fail every parse rule: a user-scope run must not read it.
  writeConfig(dir, 'not-a-key\n');

  execFileSync(process.execPath, [cli, 'install', '--scope', 'user', '--no-tools', '--yes'], { cwd: dir, env: isolatedEnv(t, home) });

  const core = readFileSync(join(home, '.agentsmith/AGENTS.md'), 'utf8');
  assert.match(core, /\| `docs\/adr\/<decision-slug>\.md` \| the standing/, 'the home config was read and applied');
  assert.ok(!core.includes('`docs/design-decisions/<decision-slug>.md`'), 'the default path is gone from the map');
  assert.ok(!existsSync(join(dir, '.agentsmith/AGENTS.md')), 'nothing written to the cwd');
});

test('C6: --stdout output is unchanged by a config in the cwd', (t) => {
  const plain = makeTempDir(t, 'agentsmith-c6a-');
  const configured = makeTempDir(t, 'agentsmith-c6b-');
  const home = makeTempDir(t, 'agentsmith-home-');
  writeConfig(configured, 'rows:\n  swe-design-decisions:\n    path: docs/adr/<decision-slug>.md\n  swe-technical-debts:\n    external: jira/ENG\n');

  const stdoutOf = (cwd) => {
    const r = spawnSync(process.execPath, [cli, '--stdout'], { cwd, env: isolatedEnv(t, home), encoding: 'utf8', maxBuffer: 1024 * 1024 * 16 });
    assert.equal(r.status, 0, 'exit 0');
    return r.stdout;
  };

  const baseline = stdoutOf(plain);
  assert.ok(baseline.length > 0, 'the query printed something');
  assert.equal(stdoutOf(configured), baseline, '--stdout reads no config');
  assert.ok(!baseline.includes('docs/adr/'), 'the override did not reach the printed set');
  assert.ok(!baseline.includes(NOTE_OPEN) && !baseline.includes(NOTE_CLOSE), 'no note marker in the printed set');
});

test('C6: --stdout still emits both build warnings with a config present', (t) => {
  const pkg = copyPackage(t);
  const dir = makeTempDir(t, 'agentsmith-c6c-');
  const home = makeTempDir(t, 'agentsmith-home-');
  // The real tree raises neither warning, so plant one of each: the warnings are
  // anchored to buildOutputs and must still run before the --stdout exit.
  const planted = join(pkg, 'instructions/core/swe/swe-reuse.md');
  writeFileSync(planted, `${readFileSync(planted, 'utf8')}\nPlanted: #c6-planted-dangling, and #be-api-first from a core rule.\n`);
  writeConfig(dir, 'rows:\n  swe-future-work:\n    external: github/issues\n');

  const r = spawnSync(process.execPath, [join(pkg, 'bin/cli.js'), '--stdout'], { cwd: dir, env: isolatedEnv(t, home), encoding: 'utf8', maxBuffer: 1024 * 1024 * 16 });

  assert.equal(r.status, 0, 'exit 0');
  assert.ok(r.stdout.length > 0, 'the query still printed');
  assert.match(r.stderr, /warning -- unresolved #tag references: [^\n]*c6-planted-dangling/, 'dangling-tag warning still emitted');
  assert.match(r.stderr, /warning -- core rule references a bundle-only #tag: [^\n]*be-api-first/, 'cross-boundary warning still emitted');
});

test('C9: install --help carries the config line', () => {
  const out = execFileSync(process.execPath, [cli, 'install', '--help'], { encoding: 'utf8' });
  assert.ok(out.includes(CONFIG_HELP_LINE), 'the discovery line is in install --help');
});


// --- C4 and C7: the plan line and the gitignore probe ---------------------------

const TWO_ROW_CONFIG = 'rows:\n  swe-design-decisions:\n    path: docs/adr/<decision-slug>.md\n  swe-technical-debts:\n    external: jira/ENG\n';
const LAYOUT_LINE = '  layout  2 row(s) remapped from .agentsmith/docs-layout.yaml: swe-design-decisions -> docs/adr/<decision-slug>.md, swe-technical-debts -> external -- jira/ENG';
const IGNORE_WARNING = "agentsmith: warning -- .agentsmith/docs-layout.yaml is gitignored, so teammates will not get this layout. Add '!.agentsmith/docs-layout.yaml' after '.agentsmith/*' in .gitignore (see README).";
const README_RECIPE = '.agentsmith/*\n!.agentsmith/docs-layout.yaml\n';

const agentsmith = (cwd, args, env) => spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: 'utf8' });
const countOf = (text, needle) => text.split(needle).length - 1;

// Every case variant of PATH is dropped, then PATH is pointed at an empty directory.
// Dropping it alone is not enough on Windows: the OS re-supplies the machine PATH to a
// child that has none, so git would still resolve and the test would prove nothing.
function withPathToEmptyDir(env, emptyDir) {
  const rest = Object.entries(env).filter(([key]) => key.toLowerCase() !== 'path');
  return { ...Object.fromEntries(rest), PATH: emptyDir };
}

function gitRepo(t, prefix, env, gitignore) {
  const dir = makeTempDir(t, prefix);
  const init = spawnSync('git', ['init', '-q'], { cwd: dir, env, encoding: 'utf8' });
  assert.equal(init.status, 0, `git init in the temp dir: ${init.stderr}`);
  if (gitignore !== undefined) writeFileSync(join(dir, '.gitignore'), gitignore);
  return dir;
}

const checkIgnored = (dir, env) => spawnSync('git', ['check-ignore', '-q', '--', join(dir, CONFIG_REL)], { cwd: dir, env }).status;

test('C4: an install plan carries the layout line once; the config stays out of the manifest', (t) => {
  const dir = makeTempDir(t, 'agentsmith-c4a-');
  const home = makeTempDir(t, 'agentsmith-home-');
  writeConfig(dir, TWO_ROW_CONFIG);

  const r = agentsmith(dir, NO_CONFIG_ARGS, isolatedEnv(t, home));

  assert.equal(r.status, 0, r.stderr);
  assert.equal(countOf(r.stderr, LAYOUT_LINE), 1, 'the layout line appears exactly once');
  assert.ok(r.stderr.split('\n').includes(LAYOUT_LINE), 'in the external -- <label> form, on its own line');
  assert.ok(r.stderr.indexOf(LAYOUT_LINE) > r.stderr.indexOf(PLAN_MARKER), 'inside the plan');
  const manifestText = readFileSync(join(dir, '.agentsmith/.install-manifest.json'), 'utf8');
  assert.ok(!manifestText.includes('docs-layout.yaml'), 'the config is never in the manifest');
  assert.ok(existsSync(join(dir, CONFIG_REL)), 'the config is still on disk');
});

test('C4: no config means no layout line', (t) => {
  const dir = makeTempDir(t, 'agentsmith-c4b-');
  const home = makeTempDir(t, 'agentsmith-home-');
  const r = agentsmith(dir, NO_CONFIG_ARGS, isolatedEnv(t, home));
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.stderr.includes('  layout  '), 'silent when nothing is remapped');
});

test('C4: an uninstall plan carries no layout line and leaves the config in place', (t) => {
  const dir = makeTempDir(t, 'agentsmith-c4c-');
  const home = makeTempDir(t, 'agentsmith-home-');
  const env = isolatedEnv(t, home);
  writeConfig(dir, TWO_ROW_CONFIG);
  assert.equal(agentsmith(dir, NO_CONFIG_ARGS, env).status, 0);

  const r = agentsmith(dir, ['uninstall', '--yes'], env);

  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stderr.includes(PLAN_MARKER), 'the uninstall plan was printed');
  assert.ok(!r.stderr.includes('  layout  '), 'no layout line on an uninstall plan');
  assert.ok(existsSync(join(dir, CONFIG_REL)), 'uninstall leaves the config on disk');
  assert.ok(!existsSync(join(dir, '.agentsmith/AGENTS.md')), 'the uninstall really ran');
});

test('C4: install --clean carries the layout line once, on the install plan it confirms second', (t) => {
  const dir = makeTempDir(t, 'agentsmith-c4d-');
  const home = makeTempDir(t, 'agentsmith-home-');
  const env = isolatedEnv(t, home);
  writeConfig(dir, TWO_ROW_CONFIG);
  assert.equal(agentsmith(dir, NO_CONFIG_ARGS, env).status, 0);

  const r = agentsmith(dir, [...NO_CONFIG_ARGS, '--clean'], env);

  assert.equal(r.status, 0, r.stderr);
  assert.equal(countOf(r.stderr, PLAN_MARKER), 2, 'two plans: uninstall, then install');
  assert.equal(countOf(r.stderr, LAYOUT_LINE), 1, 'the layout line appears exactly once');
  assert.ok(r.stderr.indexOf(LAYOUT_LINE) > r.stderr.lastIndexOf(PLAN_MARKER), 'and it sits on the second (install) plan');
  assert.ok(existsSync(join(dir, CONFIG_REL)), 'install --clean leaves the config on disk');
  const core = readFileSync(join(dir, '.agentsmith/AGENTS.md'), 'utf8');
  assert.match(core, /external -- `jira\/ENG`/, 'the clean install wrote the remapped map the line disclosed');
});

test('C7: a present, gitignored config warns on stderr and exits 0', (t) => {
  const home = makeTempDir(t, 'agentsmith-home-');
  const env = isolatedEnv(t, home);
  const dir = gitRepo(t, 'agentsmith-c7a-', env, '.agentsmith/*\n');
  writeConfig(dir, TWO_ROW_CONFIG);

  const r = agentsmith(dir, NO_CONFIG_ARGS, env);

  assert.equal(r.status, 0, 'a warning never fails the run');
  assert.equal(countOf(r.stderr, IGNORE_WARNING), 1, 'the exact warning, once');
  assert.ok(!r.stdout.includes('gitignored'), 'not on stdout');
});

test('C7: the warning precedes the confirmation, so --dry-run shows it without writing', (t) => {
  const home = makeTempDir(t, 'agentsmith-home-');
  const env = isolatedEnv(t, home);
  const dir = gitRepo(t, 'agentsmith-c7b-', env, '.agentsmith/*\n');
  writeConfig(dir, TWO_ROW_CONFIG);

  const r = agentsmith(dir, ['install', '--no-tools', '--dry-run'], env);

  assert.equal(r.status, 0);
  assert.equal(countOf(r.stderr, IGNORE_WARNING), 1);
  assert.ok(!existsSync(join(dir, '.agentsmith/AGENTS.md')), 'nothing was written');
});

test('C7: no config means no warning, even in an ignoring repo', (t) => {
  const home = makeTempDir(t, 'agentsmith-home-');
  const env = isolatedEnv(t, home);
  const dir = gitRepo(t, 'agentsmith-c7c-', env, '.agentsmith/*\n');

  const r = agentsmith(dir, NO_CONFIG_ARGS, env);

  assert.equal(r.status, 0);
  assert.ok(!r.stderr.includes('gitignored'));
});

test('C7: a tracked config is silent even when a pattern matches it', (t) => {
  const home = makeTempDir(t, 'agentsmith-home-');
  const env = isolatedEnv(t, home);
  const dir = gitRepo(t, 'agentsmith-c7d-', env, '.agentsmith/*\n');
  writeConfig(dir, TWO_ROW_CONFIG);
  const add = spawnSync('git', ['add', '-f', '--', CONFIG_REL], { cwd: dir, env, encoding: 'utf8' });
  assert.equal(add.status, 0, add.stderr);
  assert.equal(checkIgnored(dir, env), 1, 'git reports a tracked file as not ignored');

  const r = agentsmith(dir, NO_CONFIG_ARGS, env);

  assert.equal(r.status, 0);
  assert.ok(!r.stderr.includes('gitignored'));
});

test("C7: the README's re-admit recipe reads the config as not ignored, and silences the warning", (t) => {
  const home = makeTempDir(t, 'agentsmith-home-');
  const env = isolatedEnv(t, home);
  const dir = gitRepo(t, 'agentsmith-c7e-', env, '.agentsmith/*\n');
  writeConfig(dir, TWO_ROW_CONFIG);
  assert.equal(checkIgnored(dir, env), 0, 'without the re-admit line the config is ignored');

  writeFileSync(join(dir, '.gitignore'), README_RECIPE);
  assert.equal(checkIgnored(dir, env), 1, 'with the recipe, git reports the config not ignored');

  const r = agentsmith(dir, NO_CONFIG_ARGS, env);
  assert.equal(r.status, 0);
  assert.ok(!r.stderr.includes('gitignored'), 'the documented fix silences the warning');
});

test('C7: git unavailable is silent and non-fatal', (t) => {
  const home = makeTempDir(t, 'agentsmith-home-');
  const env = isolatedEnv(t, home);
  const dir = gitRepo(t, 'agentsmith-c7f-', env, '.agentsmith/*\n');
  writeConfig(dir, TWO_ROW_CONFIG);
  assert.equal(countOf(agentsmith(dir, ['install', '--no-tools', '--dry-run'], env).stderr, IGNORE_WARNING), 1, 'the same repo warns when git is reachable');

  const r = agentsmith(dir, NO_CONFIG_ARGS, withPathToEmptyDir(env, makeTempDir(t, 'agentsmith-nogit-')));

  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.stderr.includes('gitignored'), 'no warning without git');
  assert.ok(existsSync(join(dir, '.agentsmith/AGENTS.md')), 'the install still completed');
});

test('C7: a config outside any git repo is a silent skip', (t) => {
  const home = makeTempDir(t, 'agentsmith-home-');
  const dir = makeTempDir(t, 'agentsmith-c7g-');
  // Stops git walking up into a repo that happens to contain the temp dir.
  const env = { ...isolatedEnv(t, home), GIT_CEILING_DIRECTORIES: dirname(dir) };
  writeConfig(dir, TWO_ROW_CONFIG);

  const r = agentsmith(dir, NO_CONFIG_ARGS, env);

  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.stderr.includes('gitignored'));
});

test('C7: an uninstall is silent, and install --clean warns once, on its install plan', (t) => {
  const home = makeTempDir(t, 'agentsmith-home-');
  const env = isolatedEnv(t, home);
  const dir = gitRepo(t, 'agentsmith-c7h-', env, '.agentsmith/*\n');
  writeConfig(dir, TWO_ROW_CONFIG);
  assert.equal(agentsmith(dir, NO_CONFIG_ARGS, env).status, 0);

  const clean = agentsmith(dir, [...NO_CONFIG_ARGS, '--clean'], env);
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(countOf(clean.stderr, IGNORE_WARNING), 1, 'one warning across both plans');
  assert.ok(clean.stderr.indexOf(IGNORE_WARNING) > clean.stderr.indexOf('DELETE'), 'after the uninstall plan');

  const uninstall = agentsmith(dir, ['uninstall', '--yes'], env);
  assert.equal(uninstall.status, 0, uninstall.stderr);
  assert.ok(!uninstall.stderr.includes('gitignored'), 'no warning on an uninstall');
});

test('C7: --scope user skips the probe entirely', (t) => {
  const home = makeTempDir(t, 'agentsmith-home-');
  const env = isolatedEnv(t, home);
  const init = spawnSync('git', ['init', '-q'], { cwd: home, env, encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  writeFileSync(join(home, '.gitignore'), '.agentsmith/*\n');
  writeConfig(home, TWO_ROW_CONFIG);
  assert.equal(checkIgnored(home, env), 0, 'a probe of this config would warn');
  const dir = makeTempDir(t, 'agentsmith-c7i-');

  const r = agentsmith(dir, ['install', '--scope', 'user', '--no-tools', '--yes'], env);

  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.stderr.includes('gitignored'), 'no probe at user scope');
  assert.ok(r.stderr.includes(LAYOUT_LINE), 'the layout line is still disclosed');
});
