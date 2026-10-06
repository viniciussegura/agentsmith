import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '../test-helpers/tmp-dir.mjs';
import { agentsmithHooks, HOOK_FILES } from '../src/settings.js';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const HOOKS_DIR = join(root, 'tools', 'claude', 'hooks', 'agentsmith');
const hook = (name) => join(HOOKS_DIR, `${name}.mjs`);

// Marker words are assembled from parts so the installed guard never trips on this file.
const M = { todo: ['TO', 'DO'].join(''), fixme: ['FIX', 'ME'].join(''), hack: ['HA', 'CK'].join('') };

const BLOCK = 2;
const NOTICE = 1;
const ALLOW = 0;

// Every git child of a test, and of the hooks the tests spawn, runs with the global
// and system config isolated, so a developer's init.defaultBranch or hooksPath cannot
// change a verdict.
let gitEnv;
before((t) => {
  const isolated = makeTempDir(t, 'agentsmith-hooks-gitcfg-');
  const emptyConfig = join(isolated, 'gitconfig');
  writeFileSync(emptyConfig, '');
  // A hook's silence is asserted on stderr, so Node's own startup warnings (an unreadable
  // NODE_EXTRA_CA_CERTS on this machine, say) must not reach the child.
  const { NODE_EXTRA_CA_CERTS: _dropped, ...inherited } = process.env;
  gitEnv = {
    ...inherited,
    GIT_CONFIG_GLOBAL: emptyConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'hooks test',
    GIT_AUTHOR_EMAIL: 'hooks@example.invalid',
    GIT_COMMITTER_NAME: 'hooks test',
    GIT_COMMITTER_EMAIL: 'hooks@example.invalid',
  };
});

function git(dir, ...args) {
  const r = spawnSync('git', args, { cwd: dir, env: gitEnv, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed:\n${r.stderr}`);
  return r.stdout.trim();
}

// A throwaway repository on `branch`, with one commit unless `empty`.
function repo(t, { branch = 'feature', empty = false } = {}) {
  const dir = makeTempDir(t, 'agentsmith-hooks-repo-');
  git(dir, 'init', '-q', '-b', branch);
  if (!empty) {
    writeFileSync(join(dir, 'README'), 'x\n');
    git(dir, 'add', 'README');
    git(dir, 'commit', '-q', '-m', 'init');
  }
  return dir;
}

function pointOriginHeadAt(dir, branch) {
  git(dir, 'update-ref', `refs/remotes/origin/${branch}`, 'HEAD');
  git(dir, 'symbolic-ref', 'refs/remotes/origin/HEAD', `refs/remotes/origin/${branch}`);
}

function commitOptOut(dir, text) {
  mkdirSync(join(dir, '.agentsmith'), { recursive: true });
  writeFileSync(join(dir, '.agentsmith', 'hooks.yaml'), text);
  git(dir, 'add', '.agentsmith/hooks.yaml');
  git(dir, 'commit', '-q', '-m', 'opt out');
}

function run(name, payload, { raw } = {}) {
  const input = raw !== undefined ? raw : JSON.stringify(payload);
  const r = spawnSync(process.execPath, [hook(name)], { input, env: gitEnv, encoding: 'utf8' });
  return { code: r.status, err: r.stderr, out: r.stdout };
}

const bash = (command, cwd) => ({ tool_name: 'Bash', tool_input: { command }, cwd });
const pwsh = (command, cwd) => ({ tool_name: 'PowerShell', tool_input: { command }, cwd });

const expectBlock = (r, rule) => {
  assert.equal(r.code, BLOCK, `expected a block, got ${r.code}: ${r.err}`);
  assert.match(r.err, new RegExp(`Blocked by .*${rule}`));
};
const expectNotice = (r) => {
  assert.equal(r.code, NOTICE, `expected a notice, got ${r.code}: ${r.err}`);
  assert.ok(r.err.trim().length > 0, 'a notice names what could not be evaluated');
};
const expectSilent = (r) => {
  assert.equal(r.code, ALLOW, `expected a silent allow, got ${r.code}: ${r.err}`);
  assert.equal(r.err, '');
};

// ---------------------------------------------------------------------------
// guard-git-flags: parsing forms and block set. These need no repository state, so
// one feature-branch repo serves every case (the opt-out read needs a repository).
// ---------------------------------------------------------------------------

test('guard-git-flags blocks every force form and hook-skipping form', (t) => {
  const dir = repo(t);
  const blocked = [
    'git push --force',
    'git push -f origin main',
    'git push --force-with-lease',
    'git push --force-with-lease=main:abc123 origin',
    'git push --force-if-includes origin main',
    'git push origin +main',
    'git push -uf origin main',
    'git push --forc origin main',
    'git commit --no-verify -m x',
    'git commit -n -m x',
    'git commit -an -m x',
    'git commit --no-verif -m x',
    'git push --no-verify',
    'git -c core.hooksPath=/dev/null commit -m x',
    'git --config-env=core.hooksPath=HP commit -m x',
    'GIT_CONFIG_PARAMETERS="\'core.hooksPath=/dev/null\'" git commit -m x',
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/x git commit -m x',
    'export GIT_CONFIG_PARAMETERS="\'core.hooksPath=/x\'" && git commit -m x',
    'git config core.hooksPath /dev/null',
    'git config --global core.hookspath /x',
  ];
  for (const command of blocked) {
    const r = run('guard-git-flags', bash(command, dir));
    assert.equal(r.code, BLOCK, `${command}: expected a block, got ${r.code}: ${r.err}`);
    assert.match(r.err, /Blocked by #git-branch-workflow and #git-tooling/, command);
    assert.ok(!r.err.includes(command), 'the message never echoes the command');
  }
});

test('guard-git-flags allows look-alikes and ordinary commands silently', (t) => {
  const dir = repo(t);
  const allowed = [
    'git push origin main',
    'git push -u origin feature',
    'git commit -m "add new"',
    'git commit -m"add new"',
    'git commit -m "use git push --force later"',
    "git commit -m 'never --no-verify'",
    'git merge -n other',
    'git commit-tree HEAD^{tree} -m x',
    'git push origin main -- --force',
    'git push --follow-tags origin main',
    'echo git push --force',
    'grep git file.txt',
    'ls -la',
  ];
  for (const command of allowed) expectSilent(run('guard-git-flags', bash(command, dir)));
});

test('guard-git-flags sees through every segment and wrapper form', (t) => {
  const dir = repo(t);
  const blocked = [
    'echo start && git push --force',
    'echo start; git push --force',
    'echo start & git push --force',
    'echo start || git push --force',
    'echo start | git push --force',
    'echo start\ngit push --force',
    '(cd sub && git push --force)',
    '{ git push --force; }',
    'if true; then git push --force; fi',
    '! git push --force',
    'bash -c "git push --force"',
    'bash -lc "git push --force"',
    'sh -ec "git push --force"',
    'echo $(git push --force)',
    'echo `git push --force`',
    'FOO=bar git push --force',
    'env -i git push --force',
    'env FOO=bar git push --force',
    'sudo -u me git push --force',
    'nice -n 5 git push --force',
    'timeout 60 git push --force',
    'nohup git push --force',
    'rtk proxy git push --force',
    'echo main | xargs git push --force origin',
    'find . -name x -exec git push --force \\;',
    '/usr/bin/git push --force',
    'git.exe push --force',
    'git -C sub push --force',
    'git --no-pager -c user.name=x push --force',
    'git --git-dir=.git --work-tree=. push --force',
  ];
  for (const command of blocked) {
    const r = run('guard-git-flags', bash(command, dir));
    assert.equal(r.code, BLOCK, `${command}: expected a block, got ${r.code}: ${r.err}`);
  }
});

test('guard-git-flags parses a PowerShell payload with its own quoting rules', (t) => {
  const dir = repo(t);
  expectBlock(run('guard-git-flags', pwsh('& git push --force', dir)), '#git-branch-workflow');
  expectBlock(run('guard-git-flags', pwsh('git -C C:\\repo push --force', dir)), '#git-branch-workflow');
  expectBlock(run('guard-git-flags', pwsh('git -C "C:\\repo\\" push --force', dir)), '#git-branch-workflow');
  expectSilent(run('guard-git-flags', pwsh('git commit -m "tick ` and --force inside"', dir)));
  expectNotice(run('guard-git-flags', pwsh('git commit -m "unterminated', dir)));
  assert.equal(run('guard-git-flags', pwsh('git commit -m "unterminated; git push --force', dir)).code, NOTICE);
  assert.equal(run('guard-git-flags', bash('git commit -m "unterminated" && git push --force && echo "open', dir)).code, BLOCK);
});

test('guard-git-flags block wins over a notice from another segment', (t) => {
  const dir = repo(t);
  const r = run('guard-git-flags', bash('git commit -m "x && git push --force', dir));
  assert.equal(r.code, NOTICE);
  const r2 = run('guard-git-flags', bash('git push --force && git commit -m "x', dir));
  assert.equal(r2.code, BLOCK);
});

// ---------------------------------------------------------------------------
// guard-default-branch
// ---------------------------------------------------------------------------

const COMMIT_CREATING = ['commit -m x', 'merge other', 'cherry-pick abc', 'revert HEAD', 'am patch.mbox', 'rebase other'];

test('guard-default-branch blocks each commit-creating subcommand on the default branch', (t) => {
  const dir = repo(t, { branch: 'main' });
  pointOriginHeadAt(dir, 'main');
  for (const sub of COMMIT_CREATING) {
    const r = run('guard-default-branch', bash(`git ${sub}`, dir));
    assert.equal(r.code, BLOCK, `git ${sub}: expected a block, got ${r.code}: ${r.err}`);
    assert.match(r.err, /Blocked by #git-branch-workflow/);
  }
  expectSilent(run('guard-default-branch', bash('git status', dir)));
  expectSilent(run('guard-default-branch', bash('git merge --ff-only origin/main', dir)));
});

// A repository whose default is main, checked out on a feature branch.
function featureRepo(t) {
  const dir = repo(t, { branch: 'main' });
  pointOriginHeadAt(dir, 'main');
  git(dir, 'checkout', '-q', '-b', 'feature');
  return dir;
}

test('guard-default-branch allows a commit on a feature branch, detached HEAD, and an unborn branch', (t) => {
  const feature = featureRepo(t);
  expectSilent(run('guard-default-branch', bash('git commit -m x', feature)));

  const detached = repo(t, { branch: 'main' });
  git(detached, 'checkout', '-q', '--detach');
  expectSilent(run('guard-default-branch', bash('git commit -m x', detached)));

  const unborn = repo(t, { branch: 'main', empty: true });
  expectSilent(run('guard-default-branch', bash('git commit -m x', unborn)));
});

test('guard-default-branch resolves the default from origin/HEAD, then init.defaultBranch, then main or master', (t) => {
  const viaOrigin = repo(t, { branch: 'trunk' });
  pointOriginHeadAt(viaOrigin, 'trunk');
  expectBlock(run('guard-default-branch', bash('git commit -m x', viaOrigin)), '#git-branch-workflow');

  const viaConfig = repo(t, { branch: 'trunk' });
  git(viaConfig, 'config', 'init.defaultBranch', 'trunk');
  expectBlock(run('guard-default-branch', bash('git commit -m x', viaConfig)), '#git-branch-workflow');

  const viaMaster = repo(t, { branch: 'master' });
  expectBlock(run('guard-default-branch', bash('git commit -m x', viaMaster)), '#git-branch-workflow');

  const none = repo(t, { branch: 'feature' });
  expectNotice(run('guard-default-branch', bash('git commit -m x', none)));
});

test('guard-default-branch resolves the directory from -C, a leading cd, the payload cwd, then the process cwd', (t) => {
  const main = repo(t, { branch: 'main' });
  const feature = featureRepo(t);

  expectBlock(run('guard-default-branch', bash(`git -C "${main}" commit -m x`, feature)), '#git-branch-workflow');
  expectBlock(run('guard-default-branch', bash(`cd "${main}" && git commit -m x`, feature)), '#git-branch-workflow');
  expectSilent(run('guard-default-branch', bash(`cd "${main}" && cd "${feature}" && git commit -m x`, main)));
  expectBlock(run('guard-default-branch', bash('git commit -m x', main)), '#git-branch-workflow');

  const r = spawnSync(process.execPath, [hook('guard-default-branch')], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit -m x' } }),
    cwd: main, env: gitEnv, encoding: 'utf8',
  });
  assert.equal(r.status, BLOCK, 'payload cwd absent falls back to the process cwd');
});

test('guard-default-branch cannot follow a directory override and says so', (t) => {
  const dir = repo(t, { branch: 'main' });
  const undecidable = [
    'git --git-dir=/elsewhere/.git commit -m x',
    'git --work-tree=/elsewhere commit -m x',
    'GIT_DIR=/elsewhere/.git git commit -m x',
    'export GIT_WORK_TREE=/elsewhere && git commit -m x',
    'cd $TARGET && git commit -m x',
    'cd $(pwd) && git commit -m x',
    'cd ~ && git commit -m x',
    'cd - && git commit -m x',
  ];
  for (const command of undecidable) {
    const r = run('guard-default-branch', bash(command, dir));
    assert.equal(r.code, NOTICE, `${command}: expected a notice, got ${r.code}: ${r.err}`);
  }
});

test('guard-default-branch outside a repository notices, and a block elsewhere still wins', (t) => {
  const plain = makeTempDir(t, 'agentsmith-hooks-plain-');
  expectNotice(run('guard-default-branch', bash('git commit -m x', plain)));
  const main = repo(t, { branch: 'main' });
  const r = run('guard-default-branch', bash(`git --git-dir=/elsewhere/.git commit -m x && git -C "${main}" commit -m y`, main));
  assert.equal(r.code, BLOCK);
});

// ---------------------------------------------------------------------------
// guard-dated-todos
// ---------------------------------------------------------------------------

const write = (file_path, content, cwd) => ({ tool_name: 'Write', tool_input: { file_path, content }, cwd });
const edit = (file_path, old_string, new_string, cwd) => ({ tool_name: 'Edit', tool_input: { file_path, old_string, new_string }, cwd });

test('guard-dated-todos blocks an undated marker on an added line and allows the dated form', (t) => {
  const dir = repo(t);
  const file = join(dir, 'src', 'a.js');
  expectBlock(run('guard-dated-todos', write(file, `// ${M.todo}: later\n`, dir)), '#swe-dated-todos');
  expectBlock(run('guard-dated-todos', write(file, `// ${M.todo}(owner): later\n`, dir)), '#swe-dated-todos');
  expectBlock(run('guard-dated-todos', write(file, `// ${M.fixme} this\n`, dir)), '#swe-dated-todos');
  expectSilent(run('guard-dated-todos', write(file, `// ${M.todo}(2026-10-06): later\n`, dir)));
  expectSilent(run('guard-dated-todos', write(file, `const ${M.todo}_COUNT = 1;\n`, dir)));
  expectSilent(run('guard-dated-todos', write(join(dir, 'notes.md'), `${M.todo} prose\n`, dir)));
  const r = run('guard-dated-todos', write(file, `// ${M.hack}\n`, dir));
  assert.ok(!r.err.includes(M.hack) || r.err.includes('marker'), 'the message names the kind, not the payload line');
});

test('guard-dated-todos counts only added lines', (t) => {
  const dir = repo(t);
  const file = join(dir, 'src', 'a.js');
  mkdirSync(join(dir, 'src'));
  writeFileSync(file, `// ${M.todo}: old\nconst a = 1;\n`);
  expectSilent(run('guard-dated-todos', write(file, `// ${M.todo}: old\nconst a = 2;\n`, dir)));
  expectBlock(run('guard-dated-todos', write(file, `// ${M.todo}: old\n// ${M.todo}: new\n`, dir)), '#swe-dated-todos');
  expectSilent(run('guard-dated-todos', edit(file, `// ${M.todo}: old\nconst a = 1;`, `// ${M.todo}: old\nconst a = 3;`, dir)));
  expectBlock(run('guard-dated-todos', edit(file, 'const a = 1;', `const a = 1; // ${M.todo} soon`, dir)), '#swe-dated-todos');
  const multi = {
    tool_name: 'MultiEdit', cwd: dir,
    tool_input: { file_path: file, edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: `// ${M.todo} d` }] },
  };
  expectBlock(run('guard-dated-todos', multi), '#swe-dated-todos');
});

// ---------------------------------------------------------------------------
// Undecidable payloads, opt-out, precedence
// ---------------------------------------------------------------------------

test('every hook allows silently when there is nothing to decide', () => {
  for (const name of ['guard-default-branch', 'guard-git-flags', 'guard-dated-todos', 'require-explicit-model']) {
    expectSilent(run(name, null, { raw: '' }));
    expectSilent(run(name, null, { raw: '{not json' }));
    expectSilent(run(name, { tool_name: 'Other', tool_input: {} }));
  }
});

test('a committed opt-out disables the named hook only; a working-tree copy does not', (t) => {
  const dir = repo(t, { branch: 'main' });
  pointOriginHeadAt(dir, 'main');
  expectBlock(run('guard-default-branch', bash('git commit -m x', dir)), '#git-branch-workflow');
  mkdirSync(join(dir, '.agentsmith'), { recursive: true });
  writeFileSync(join(dir, '.agentsmith', 'hooks.yaml'), 'disabled:\n  - guard-default-branch\n');
  expectBlock(run('guard-default-branch', bash('git commit -m x', dir)), '#git-branch-workflow');
  commitOptOut(dir, '# project decision\ndisabled:\n  - guard-default-branch\n');
  expectSilent(run('guard-default-branch', bash('git commit -m x', dir)));
  expectBlock(run('guard-git-flags', bash('git push --force', dir)), '#git-branch-workflow');
});

test('a committed opt-out is honoured from a subdirectory, a chained cd, and a not-yet-created directory', (t) => {
  const dir = repo(t, { branch: 'main' });
  pointOriginHeadAt(dir, 'main');
  mkdirSync(join(dir, 'src', 'deep'), { recursive: true });
  expectBlock(run('guard-default-branch', bash('cd src && git commit -m x', dir)), '#git-branch-workflow');
  expectBlock(run('guard-default-branch', bash('cd src && cd deep && git commit -m x', dir)), '#git-branch-workflow');
  const fresh = join(dir, 'brand', 'new', 'a.js');
  const r = run('guard-dated-todos', write(fresh, `// ${M.todo}: later\n`, dir));
  assert.equal(r.code, BLOCK);
  assert.equal(r.err.trim().split('\n').length, 1, 'a block in a not-yet-created directory carries no opt-out notice');
  commitOptOut(dir, 'disabled:\n  - guard-default-branch\n  - guard-dated-todos\n');
  expectSilent(run('guard-default-branch', bash('cd src && git commit -m x', dir)));
  expectSilent(run('guard-default-branch', bash('git -C src commit -m x', dir)));
  expectSilent(run('guard-dated-todos', write(join(dir, 'src', 'a.js'), `// ${M.todo}: later\n`, dir)));
  expectSilent(run('guard-dated-todos', write(fresh, `// ${M.todo}: later\n`, dir)));
});

test('guard-default-branch allows the commit-free --abort and --quit forms on the default branch', (t) => {
  const dir = repo(t, { branch: 'main' });
  pointOriginHeadAt(dir, 'main');
  for (const command of ['git merge --abort', 'git cherry-pick --abort', 'git revert --abort', 'git rebase --abort', 'git am --abort', 'git cherry-pick --quit', 'git revert --quit']) {
    expectSilent(run('guard-default-branch', bash(command, dir)));
  }
  expectBlock(run('guard-default-branch', bash('git cherry-pick --continue', dir)), '#git-branch-workflow');
});

test('a malformed opt-out keeps every hook on with a notice, and is never read for a clean command', (t) => {
  const dir = repo(t, { branch: 'main' });
  pointOriginHeadAt(dir, 'main');
  commitOptOut(dir, 'disabled: guard-default-branch\n');
  const r = run('guard-default-branch', bash('git commit -m x', dir));
  assert.equal(r.code, BLOCK);
  assert.match(r.err, /hooks\.yaml/, 'the block carries the opt-out notice');
  expectSilent(run('guard-default-branch', bash('git status', dir)));
  const plain = makeTempDir(t, 'agentsmith-hooks-plain-');
  expectSilent(run('guard-git-flags', bash('git push origin main', plain)));
});

test('a valid opt-out silences a notice cause as well as a block', (t) => {
  const dir = repo(t, { branch: 'feature' });
  commitOptOut(dir, 'disabled:\n  - guard-default-branch\n');
  expectSilent(run('guard-default-branch', bash('git commit -m x', dir)));
});

test('the Agent hook honours the opt-out and still blocks a model-less dispatch otherwise', (t) => {
  const dir = repo(t);
  const dispatch = { tool_name: 'Agent', tool_input: { prompt: 'x' }, cwd: dir };
  expectBlock(run('require-explicit-model', dispatch), '#ai-conversational');
  expectSilent(run('require-explicit-model', { ...dispatch, tool_input: { prompt: 'x', model: 'sonnet' } }));
  commitOptOut(dir, 'disabled:\n  - require-explicit-model\n');
  expectSilent(run('require-explicit-model', dispatch));
});

// ---------------------------------------------------------------------------
// Wiring parity
// ---------------------------------------------------------------------------

const scriptsOf = (entries) => entries.flatMap((e) => e.hooks.map((h) => h.command.match(/\/hooks\/agentsmith\/([a-z-]+\.mjs)/)[1])).sort();

test('plugin.json, hooks.json, the settings merge, and the directory agree on the hook scripts', () => {
  const onDisk = readdirSync(HOOKS_DIR).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
  const plugin = JSON.parse(readFileSync(join(root, 'tools/claude/.claude-plugin/plugin.json'), 'utf8'));
  const hooksJson = JSON.parse(readFileSync(join(root, 'tools/claude/hooks/hooks.json'), 'utf8'));
  const merged = agentsmithHooks('.claude/hooks/agentsmith');
  assert.deepEqual(scriptsOf(plugin.hooks.PreToolUse), onDisk);
  assert.deepEqual(scriptsOf(hooksJson.hooks.PreToolUse), onDisk);
  assert.deepEqual(scriptsOf(merged.PreToolUse), onDisk);
  assert.deepEqual(HOOK_FILES.map((f) => f.split('/').pop()).sort(), onDisk);
  assert.deepEqual(
    merged.PreToolUse.map((e) => e.matcher),
    ['Agent', 'Bash|PowerShell', 'Bash|PowerShell', 'Write|Edit|MultiEdit'],
  );
});
