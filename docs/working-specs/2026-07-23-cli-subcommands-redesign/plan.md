# CLI subcommand redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: Approved

**Goal:** Replace agentsmith's flag-only CLI with a verb-first `install`/`uninstall` model plus an interactive wizard, a printed-plan confirmation gate, and both field-bug fixes, without changing generated instruction content.

**Architecture:** A pure pipeline -- `parseArgs(argv)` -> `buildInstallPlan`/`buildUninstallPlan` (a `Plan`: an in-memory list of filesystem ops) -> render/confirm -> `applyPlan`. `bin/cli.js` becomes a thin orchestrator; parsing, planning, execution, and prompting each live in a focused `src/` module. The interactive wizard is an input source that produces the same `{command, scope, flags}` a command line would, then flows through the identical plan/confirm/apply path.

**Tech Stack:** Node ESM, `node --test` (single harness, `npm test`), no new dependencies. Existing pure helpers reused: `mergeSettings` ([src/settings.js](../../../src/settings.js)), `userImport` ([src/userimport.js](../../../src/userimport.js)), `pruneOrphans`/`readManifest`/`writeManifest` ([src/manifest.js](../../../src/manifest.js)), `planToolInstall` ([src/tools.js](../../../src/tools.js)), `buildOutputs` ([src/build.js](../../../src/build.js)).

## Global Constraints

- Node ESM only; no new runtime dependencies (#swe-deps). Commit lockfile-free (repo has none).
- Single test harness: every test file runs under `node --test` via `npm test` (#swe-testing).
- One-sentence-per-line for any `.md` paragraph touched (#code-markdown).
- No magic literals: shared strings (marker, hook rel path, manifest rel) come from their existing modules (#code-style).
- AI-authored commits: `🤖 ` prefix, Conventional Commits, `Co-Authored-By:` + `Usage: model=claude-opus-4-8[1m]` trailers (#git-title, #git-usage).
- Every bug fix starts with a failing test that reproduces it (#swe-testing).
- The generated instruction content, bundle resolution, and output format do not change (spec non-goals).
- `spec-index` subcommand behavior is unchanged.

---

### Task 1: `userUnimport` (inverse of `userImport`) + settings un-merge test

**Files:**
- Modify: `src/userimport.js` (add `userUnimport`)
- Test: `test/userimport.test.js` (create)
- Test: `test/settings.test.js` (append the un-merge case)

**Interfaces:**
- Produces: `userUnimport(existingContent: string|null, targetPath: string) -> string|null` -- returns the content with agentsmith's marked import block removed, or `null` when nothing matched (no-op signal, mirroring `userImport`'s `null`).
- Consumes: existing `MARKER` and matching logic in `src/userimport.js`; `mergeSettings` from `src/settings.js`.

- [ ] **Step 1: Write the failing test for `userUnimport`**

Create `test/userimport.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { userImport, userUnimport } from '../src/userimport.js';

const TARGET = '/home/u/.agentsmith/AGENTS.md';

test('userUnimport removes exactly the marked block, preserving user content', () => {
  const withImport = userImport('# my rules\n', TARGET);        // appends the block
  const back = userUnimport(withImport, TARGET);
  assert.equal(back, '# my rules\n', 'user content restored, block gone');
});

test('userUnimport is a no-op (null) when no agentsmith block is present', () => {
  assert.equal(userUnimport('# my rules\n', TARGET), null);
  assert.equal(userUnimport(null, TARGET), null);
});

test('userImport then userUnimport round-trips', () => {
  const original = '# a\n\n# b\n';
  const round = userUnimport(userImport(original, TARGET), TARGET);
  assert.equal(round, original);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node --test test/userimport.test.js`
Expected: FAIL -- `userUnimport is not a function`.

- [ ] **Step 3: Implement `userUnimport`**

Append to `src/userimport.js` (reuse the existing `MARKER`, `norm`, `isAbsolute`):

```js
/**
 * Remove agentsmith's marked import block (the MARKER line + its following
 * import line) from ~/.claude/CLAUDE.md content. Inverse of userImport. Pure.
 *
 * @param {string|null} existingContent  Current file content, or null if absent.
 * @param {string} targetPath  Absolute path to ~/.agentsmith/AGENTS.md (any slash form).
 * @returns {string|null}  New content with the block removed, or null when nothing matched.
 */
export function userUnimport(existingContent, targetPath) {
  if (existingContent == null) return null;
  const target = norm(targetPath);
  const importLine = `@${target}`;
  const isOurImport = (t) => {
    if (t === importLine) return true;
    if (!t.startsWith('@')) return false;
    const rest = t.slice(1).trim();
    return isAbsolute(rest) && norm(rest) === target;
  };

  const lines = existingContent.split('\n');
  const kept = [];
  let removed = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === MARKER) {
      // Drop the marker and an immediately-following (optionally blank-separated) import line.
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j < lines.length && isOurImport(lines[j].trim())) {
        removed = true;
        i = j; // skip through the import line
        continue;
      }
    }
    kept.push(lines[i]);
  }
  if (!removed) return null;
  // Collapse a trailing run of blank lines the removal may have left, keeping one final newline.
  let out = kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/,'\n');
  if (out === '\n') out = '';
  return out;
}
```

- [ ] **Step 4: Run the `userUnimport` tests, verify pass**

Run: `node --test test/userimport.test.js`
Expected: PASS (3 tests). If the round-trip test fails on trailing-newline shape, adjust the block-removal normalization until `userImport`-then-`userUnimport` is exactly the identity for the fixtures above.

- [ ] **Step 5: Append the settings un-merge test**

Add to `test/settings.test.js`:

```js
import { mergeSettings, agentsmithHooks } from '../src/settings.js';

test('mergeSettings(existing, {}) removes agentsmith hooks, keeps user hooks', () => {
  const withOurs = mergeSettings(
    { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'user-thing' }] }] } },
    agentsmithHooks('.claude/hooks/agentsmith/require-explicit-model.mjs'),
  );
  const unmerged = mergeSettings(withOurs, {});
  const entries = unmerged.hooks.PreToolUse || [];
  assert.ok(entries.some((e) => e.matcher === 'Bash'), 'user hook preserved');
  assert.ok(!entries.some((e) => e.hooks?.some((h) => h.command.includes('/hooks/agentsmith/'))), 'agentsmith hook removed');
});
```

- [ ] **Step 6: Run the settings test, verify pass**

Run: `node --test test/settings.test.js`
Expected: PASS. (`mergeSettings(existing, {})` already un-merges via its deprecation sweep; this locks the behavior the uninstall path relies on.)

- [ ] **Step 7: Commit**

```bash
git add src/userimport.js test/userimport.test.js test/settings.test.js
git commit -m "🤖 feat(cli): Add userUnimport and lock settings un-merge"
```

---

### Task 2: Extract `sourceRevision` with package.json fallback

**Files:**
- Create: `src/revision.js`
- Modify: `bin/cli.js` (remove the inline `sourceRevision`, import from `src/revision.js`) -- the import swap lands here; the orchestrator rewrite is Task 7.
- Test: `test/revision.test.js` (create)

**Interfaces:**
- Produces: `sourceRevision({ pkgRoot: string, pkgVersion: string, runGit?: (args:string[]) => string }) -> { commit?: string, date?: string }` -- git short-SHA + date when available; falls back to `{ commit: pkgVersion }` when git throws; `runGit` is injectable for tests (defaults to the real `execFileSync` git call).

- [ ] **Step 1: Write the failing test**

Create `test/revision.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceRevision } from '../src/revision.js';

test('uses git when available', () => {
  const runGit = (args) => (args[0] === 'rev-parse' ? 'abc1234' : args.includes('--format=%cd') ? '2026-07-23' : '');
  const r = sourceRevision({ pkgRoot: '/x', pkgVersion: '1.0.0-rc.17', runGit });
  assert.equal(r.commit, 'abc1234');
  assert.equal(r.date, '2026-07-23');
});

test('falls back to package version when git throws', () => {
  const runGit = () => { throw new Error('not a git repo'); };
  const r = sourceRevision({ pkgRoot: '/x', pkgVersion: '1.0.0-rc.17', runGit });
  assert.equal(r.commit, '1.0.0-rc.17');
  assert.equal(r.date, undefined);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node --test test/revision.test.js`
Expected: FAIL -- module not found.

- [ ] **Step 3: Implement `src/revision.js`**

```js
import { execFileSync } from 'node:child_process';

const realGit = (pkgRoot) => (args) =>
  execFileSync('git', args, { cwd: pkgRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();

/**
 * Resolve the source-revision stamp for the generated header. Prefers git
 * (short SHA + commit date, `-dirty` when the tree is dirty); when git is
 * unavailable (npx install, no repo) falls back to the package version so the
 * artifact is never unversioned. Pure given an injected runGit.
 *
 * @param {{pkgRoot:string, pkgVersion:string, runGit?:(args:string[])=>string}} opts
 * @returns {{commit?:string, date?:string}}
 */
export function sourceRevision({ pkgRoot, pkgVersion, runGit }) {
  const git = runGit || realGit(pkgRoot);
  try {
    const commit = git(['rev-parse', '--short', 'HEAD']);
    const date = git(['log', '-1', '--format=%cd', '--date=short']);
    const dirty = git(['status', '--porcelain']) !== '';
    return { commit: dirty ? `${commit}-dirty` : commit, date };
  } catch {
    return { commit: pkgVersion };
  }
}
```

- [ ] **Step 4: Run it, verify pass**

Run: `node --test test/revision.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Swap the import in `bin/cli.js`**

Delete the inline `sourceRevision` function ([bin/cli.js:22-34](../../../bin/cli.js)); add `import { sourceRevision } from '../src/revision.js';` and change the call site (`bin/cli.js:126`) to `const { commit, date } = sourceRevision({ pkgRoot, pkgVersion: JSON.parse(readFileSync(join(pkgRoot, 'package.json'),'utf8')).version });`.

- [ ] **Step 6: Run the full suite, verify green**

Run: `npm test`
Expected: PASS (existing tests still green; the header now carries a version even without git).

- [ ] **Step 7: Commit**

```bash
git add src/revision.js test/revision.test.js bin/cli.js
git commit -m "🤖 feat(cli): Extract sourceRevision with package-version fallback"
```

---

### Task 3: `src/args.js` -- parse + validate, fail loud

**Files:**
- Create: `src/args.js`
- Test: `test/args.test.js` (create)

**Interfaces:**
- Produces: `parseArgs(argv: string[]) -> Command` where
  `Command = { kind: 'install'|'uninstall'|'spec-index'|'stdout'|'help'|'version'|'wizard'|'error', scope?: {kind:'project'|'user'|'path', path?:string}, flags?: {mode:'split'|'single', placement:'nested'|'root', tools:boolean, dev:boolean, clean:boolean, yes:boolean, dryRun:boolean, check?:boolean}, error?: string, helpVerb?: string }`.
- Bare (`argv` empty) -> `{ kind: 'wizard' }`; the orchestrator later downgrades to `error` when not a TTY.
- Unknown flag / conflicting scope / `--stdout` with disk flags -> `{ kind: 'error', error }`.

- [ ] **Step 1: Write the failing tests**

Create `test/args.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/args.js';

test('bare argv -> wizard', () => {
  assert.equal(parseArgs([]).kind, 'wizard');
});

test('install defaults', () => {
  const c = parseArgs(['install']);
  assert.equal(c.kind, 'install');
  assert.deepEqual(c.scope, { kind: 'project' });
  assert.deepEqual(c.flags, { mode: 'split', placement: 'nested', tools: true, dev: false, clean: false, yes: false, dryRun: false });
});

test('scope user and path', () => {
  assert.deepEqual(parseArgs(['install', '--scope', 'user']).scope, { kind: 'user' });
  assert.deepEqual(parseArgs(['install', '--scope', './x']).scope, { kind: 'path', path: './x' });
});

test('mode/placement/flags map through', () => {
  const c = parseArgs(['install', '--mode', 'single', '--placement', 'root', '--no-tools', '--dev', '--clean', '--yes', '--dry-run']);
  assert.deepEqual(c.flags, { mode: 'single', placement: 'root', tools: false, dev: true, clean: true, yes: true, dryRun: true });
});

test('unknown flag is a hard error', () => {
  const c = parseArgs(['install', '----no-tools']);       // the reported typo
  assert.equal(c.kind, 'error');
  assert.match(c.error, /unknown flag/i);
});

test('--out is now unknown -> error', () => {
  assert.equal(parseArgs(['install', '--out', 'x']).kind, 'error');
});

test('conflicting scope value rejected', () => {
  assert.equal(parseArgs(['install', '--scope', 'user', '--scope', 'project']).kind, 'error');
});

test('--scope needs a value', () => {
  assert.equal(parseArgs(['install', '--scope']).kind, 'error');
});

test('stdout rejects disk flags, accepts --mode', () => {
  assert.equal(parseArgs(['--stdout', '--mode', 'single']).kind, 'stdout');
  assert.equal(parseArgs(['--stdout', '--scope', 'user']).kind, 'error');
});

test('uninstall parses scope + yes/dry-run only', () => {
  const c = parseArgs(['uninstall', '--scope', 'user', '--yes']);
  assert.equal(c.kind, 'uninstall');
  assert.equal(c.flags.yes, true);
  assert.equal(parseArgs(['uninstall', '--mode', 'single']).kind, 'error'); // install-only flag
});

test('help and version and spec-index', () => {
  assert.equal(parseArgs(['--help']).kind, 'help');
  assert.equal(parseArgs(['-h']).kind, 'help');
  assert.equal(parseArgs(['install', '--help']).kind, 'help');
  assert.equal(parseArgs(['install', '--help']).helpVerb, 'install');
  assert.equal(parseArgs(['--version']).kind, 'version');
  assert.equal(parseArgs(['spec-index', '--check']).kind, 'spec-index');
});
```

- [ ] **Step 2: Run, verify fail**

Run: `node --test test/args.test.js`
Expected: FAIL -- module not found.

- [ ] **Step 3: Implement `src/args.js`**

```js
// Per-verb known-flag sets. A flag absent from the active verb's set is a hard error.
const VALUE_FLAGS = new Set(['--scope', '--mode', '--placement']);
const INSTALL_FLAGS = new Set(['--scope', '--mode', '--placement', '--no-tools', '--dev', '--clean', '--yes', '--dry-run', '--help']);
const UNINSTALL_FLAGS = new Set(['--scope', '--yes', '--dry-run', '--help']);
const STDOUT_FLAGS = new Set(['--mode']);

const err = (msg) => ({ kind: 'error', error: `agentsmith: error -- ${msg}` });

function parseScope(value) {
  if (value === 'user') return { kind: 'user' };
  if (value === 'project') return { kind: 'project' };
  return { kind: 'path', path: value };
}

// Pull `--flag value` / `--flag` tokens for a verb; validate against `known`.
function collect(tokens, known) {
  const out = { _scope: undefined, _mode: undefined, _placement: undefined, noTools: false, dev: false, clean: false, yes: false, dryRun: false, help: false };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.startsWith('-')) return err(`unexpected argument: ${t}`);
    if (!known.has(t)) return err(`unknown flag: ${t}`);
    if (VALUE_FLAGS.has(t)) {
      const v = tokens[i + 1];
      if (v === undefined || v.startsWith('--')) return err(`${t} requires a value`);
      i++;
      if (t === '--scope') { if (out._scope !== undefined) return err('--scope given more than once'); out._scope = v; }
      if (t === '--mode') out._mode = v;
      if (t === '--placement') out._placement = v;
    } else if (t === '--no-tools') out.noTools = true;
    else if (t === '--dev') out.dev = true;
    else if (t === '--clean') out.clean = true;
    else if (t === '--yes') out.yes = true;
    else if (t === '--dry-run') out.dryRun = true;
    else if (t === '--help') out.help = true;
  }
  return out;
}

/** Parse argv (process.argv.slice(2)) into a Command. Pure. */
export function parseArgs(argv) {
  if (argv.length === 0) return { kind: 'wizard' };
  if (argv[0] === '--help' || argv[0] === '-h') return { kind: 'help' };
  if (argv[0] === '--version') return { kind: 'version' };

  if (argv[0] === 'spec-index') return { kind: 'spec-index', flags: { check: argv.includes('--check') } };

  if (argv[0] === '--stdout') {
    const c = collect(argv.slice(1), STDOUT_FLAGS);
    if (c.kind === 'error') return c;
    const mode = c._mode ?? 'split';
    if (mode !== 'single' && mode !== 'split') return err(`--mode must be single|split, got ${mode}`);
    return { kind: 'stdout', flags: { mode } };
  }

  const verb = argv[0];
  if (verb !== 'install' && verb !== 'uninstall') {
    if (verb.startsWith('-')) return err(`no subcommand -- run 'agentsmith install' or 'agentsmith --help'`);
    return err(`unknown subcommand: ${verb}`);
  }
  const known = verb === 'install' ? INSTALL_FLAGS : UNINSTALL_FLAGS;
  const c = collect(argv.slice(1), known);
  if (c.kind === 'error') return c;
  if (c.help) return { kind: 'help', helpVerb: verb };

  const scope = parseScope(c._scope ?? 'project');
  const mode = c._mode ?? 'split';
  const placement = c._placement ?? 'nested';
  if (mode !== 'single' && mode !== 'split') return err(`--mode must be single|split, got ${mode}`);
  if (placement !== 'nested' && placement !== 'root') return err(`--placement must be nested|root, got ${placement}`);

  const flags = verb === 'install'
    ? { mode, placement, tools: !c.noTools, dev: c.dev, clean: c.clean, yes: c.yes, dryRun: c.dryRun }
    : { yes: c.yes, dryRun: c.dryRun };
  return { kind: verb, scope, flags };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `node --test test/args.test.js`
Expected: PASS (all cases). Adjust the `install --help` case if `helpVerb` shape differs.

- [ ] **Step 5: Commit**

```bash
git add src/args.js test/args.test.js
git commit -m "🤖 feat(cli): Add args parser with fail-loud flag validation"
```

---

### Task 4: `src/plan.js` -- plan builders + user-facing render

**Files:**
- Create: `src/plan.js`
- Test: `test/plan.test.js` (create)

**Interfaces:**
- `Op = { kind: 'write'|'prune'|'mergeSettings'|'unmergeSettings'|'writeImport'|'removeImport'|'keepStub'|'keepImport', path?: string, content?: string, paths?: string[], commandPath?: string, target?: string }`
- `Plan = { base: string, absolute: boolean, ops: Op[], manifestPaths: string[] }` -- `manifestPaths` is what `writeManifest` records after apply (install) or `[]` (uninstall).
- Produces:
  - `buildInstallPlan({ base, absolute, built, adapterPlan, scope, flags, prevManifestPaths, stubExists }) -> Plan`
  - `buildUninstallPlan({ base, absolute, manifestPaths, stubContent, stubOnDiskContent, hasSettings, hasClaudeMd, isUser }) -> Plan`
  - `renderPlan(plan) -> string` (user-facing, deletes distinguished from writes)
- Consumes: `built` = `buildOutputs(...)` result (`corePath`, `coreContent`, `bundles`, `stub`), `adapterPlan` = `planToolInstall(...)` result, `orphanPaths` from `src/manifest.js`, `HOOK_REL` from `src/settings.js`.

- [ ] **Step 1: Write the failing tests**

Create `test/plan.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInstallPlan, buildUninstallPlan, renderPlan } from '../src/plan.js';

const built = {
  corePath: '.agentsmith/AGENTS.md', coreContent: 'CORE',
  bundles: [{ path: '.agentsmith/agents/frontend.md', content: 'FE' }],
  stub: { path: 'AGENTS.md', content: 'STUB' },
};
const adapterPlan = [{ src: 'tools/claude/skills/x/SKILL.md', dest: '.claude/skills/x/SKILL.md' }];

test('install plan writes core+bundles+adapters and merges settings when tools on', () => {
  const p = buildInstallPlan({ base: '/b', absolute: false, built, adapterPlan, scope: { kind: 'project' },
    flags: { mode: 'split', placement: 'nested', tools: true, dev: false, clean: false, yes: false, dryRun: false },
    prevManifestPaths: [], stubExists: false });
  const kinds = p.ops.map((o) => o.kind);
  assert.ok(kinds.includes('write'));
  assert.ok(kinds.includes('mergeSettings'));
  assert.ok(!kinds.includes('unmergeSettings'));
  assert.ok(p.manifestPaths.includes('.agentsmith/AGENTS.md'));
  assert.ok(p.manifestPaths.includes('.claude/skills/x/SKILL.md'));
});

test('install --no-tools un-merges the hook instead of merging (bug-2 fix)', () => {
  const p = buildInstallPlan({ base: '/b', absolute: false, built, adapterPlan: [], scope: { kind: 'project' },
    flags: { mode: 'split', placement: 'nested', tools: false, dev: false, clean: false, yes: false, dryRun: false },
    prevManifestPaths: [], stubExists: false });
  const kinds = p.ops.map((o) => o.kind);
  assert.ok(kinds.includes('unmergeSettings'), 'tools-off un-merges');
  assert.ok(!kinds.includes('mergeSettings'), 'tools-off never merges');
});

test('install keeps an existing stub rather than overwriting', () => {
  const p = buildInstallPlan({ base: '/b', absolute: false, built, adapterPlan, scope: { kind: 'project' },
    flags: { mode: 'split', placement: 'nested', tools: true, dev: false, clean: false, yes: false, dryRun: false },
    prevManifestPaths: [], stubExists: true });
  assert.ok(p.ops.some((o) => o.kind === 'keepStub'));
  assert.ok(!p.ops.some((o) => o.kind === 'write' && o.path === 'AGENTS.md'));
});

test('install prunes recorded orphans no longer produced', () => {
  const p = buildInstallPlan({ base: '/b', absolute: false, built, adapterPlan, scope: { kind: 'project' },
    flags: { mode: 'split', placement: 'nested', tools: true, dev: false, clean: false, yes: false, dryRun: false },
    prevManifestPaths: ['.claude/commands/ghost.md'], stubExists: false });
  const prune = p.ops.find((o) => o.kind === 'prune');
  assert.ok(prune.paths.includes('.claude/commands/ghost.md'));
});

test('uninstall plan prunes all manifest paths, un-merges, removes import (user)', () => {
  const p = buildUninstallPlan({ base: '/home', absolute: true, manifestPaths: ['.agentsmith/AGENTS.md', '.claude/skills/x/SKILL.md'],
    stubContent: 'STUB', stubOnDiskContent: 'STUB', hasSettings: true, hasClaudeMd: true, isUser: true });
  const kinds = p.ops.map((o) => o.kind);
  assert.ok(kinds.includes('prune'));
  assert.ok(kinds.includes('unmergeSettings'));
  assert.ok(kinds.includes('removeImport'));
  assert.ok(p.ops.some((o) => o.kind === 'prune' && o.paths.includes('.claude/skills/x/SKILL.md')));
  assert.equal(p.manifestPaths.length, 0);
});

test('uninstall keeps an edited stub', () => {
  const p = buildUninstallPlan({ base: '/home', absolute: true, manifestPaths: [],
    stubContent: 'STUB', stubOnDiskContent: 'EDITED BY USER', hasSettings: false, hasClaudeMd: false, isUser: false });
  assert.ok(p.ops.some((o) => o.kind === 'keepStub'));
});

test('renderPlan marks deletes distinctly from writes', () => {
  const out = renderPlan({ base: '/b', absolute: false, manifestPaths: [], ops: [
    { kind: 'write', path: '.agentsmith/AGENTS.md' },
    { kind: 'prune', paths: ['.claude/a.md', '.claude/b.md'] },
    { kind: 'unmergeSettings', path: '.claude/settings.json' },
  ] });
  assert.match(out, /delete/i);
  assert.match(out, /write/i);
  assert.doesNotMatch(out, /unmergeSettings/);       // internal enum never printed verbatim
});
```

- [ ] **Step 2: Run, verify fail**

Run: `node --test test/plan.test.js`
Expected: FAIL -- module not found.

- [ ] **Step 3: Implement `src/plan.js`**

```js
import { orphanPaths } from './manifest.js';
import { HOOK_REL } from './settings.js';

// buildInstallPlan: assemble the ordered op list for an install (pure).
export function buildInstallPlan({ base, absolute, built, adapterPlan, scope, flags, prevManifestPaths, stubExists }) {
  const ops = [];
  const manifestPaths = [
    built.corePath,
    ...built.bundles.map((b) => b.path),
    ...adapterPlan.map((p) => p.dest),
  ];

  const orphans = orphanPaths(prevManifestPaths, manifestPaths);
  if (orphans.length) ops.push({ kind: 'prune', paths: orphans });

  ops.push({ kind: 'write', path: built.corePath, content: built.coreContent });
  for (const b of built.bundles) ops.push({ kind: 'write', path: b.path, content: b.content });

  // Root stub: write-once (project + nested only). Kept if present.
  if (built.stub) {
    ops.push(stubExists ? { kind: 'keepStub', path: built.stub.path } : { kind: 'write', path: built.stub.path, content: built.stub.content });
  }

  // Adapter files.
  for (const a of adapterPlan) ops.push({ kind: 'write', path: a.dest, src: a.src });

  // User-scope import wiring.
  if (scope.kind === 'user') ops.push({ kind: 'writeImport', path: '.claude/CLAUDE.md', target: built.corePath });

  // settings.json: merge our hook when tools installed, else un-merge any stale entry (bug-2 fix).
  const commandPath = absolute ? HOOK_REL : HOOK_REL; // resolved to absolute by execute when absolute=true
  ops.push(flags.tools
    ? { kind: 'mergeSettings', path: '.claude/settings.json', commandPath }
    : { kind: 'unmergeSettings', path: '.claude/settings.json' });

  return { base, absolute, ops, manifestPaths };
}

// buildUninstallPlan: reverse an install of the same scope (pure).
export function buildUninstallPlan({ base, absolute, manifestPaths, stubContent, stubOnDiskContent, hasSettings, hasClaudeMd, isUser }) {
  const ops = [];
  if (manifestPaths.length) ops.push({ kind: 'prune', paths: manifestPaths });
  if (hasSettings) ops.push({ kind: 'unmergeSettings', path: '.claude/settings.json' });
  if (isUser && hasClaudeMd) ops.push({ kind: 'removeImport', path: '.claude/CLAUDE.md' });
  // Root stub: delete only if unmodified; else keep.
  if (stubOnDiskContent != null) {
    ops.push(stubOnDiskContent === stubContent ? { kind: 'prune', paths: ['AGENTS.md'] } : { kind: 'keepStub', path: 'AGENTS.md' });
  }
  ops.push({ kind: 'prune', paths: ['.agentsmith/.install-manifest.json'] });
  return { base, absolute, ops, manifestPaths: [] };
}

const REL = (p) => p.replace(/\\/g, '/');

// renderPlan: user-facing text. Internal op names never printed; deletes marked distinctly.
export function renderPlan(plan) {
  const writes = [];
  const deletes = [];
  const updates = [];
  const keeps = [];
  for (const op of plan.ops) {
    if (op.kind === 'write') writes.push(REL(op.path));
    else if (op.kind === 'prune') deletes.push(...op.paths.map(REL));
    else if (op.kind === 'mergeSettings') updates.push(`${REL(op.path)} (add agentsmith hook)`);
    else if (op.kind === 'unmergeSettings') updates.push(`${REL(op.path)} (remove agentsmith hook)`);
    else if (op.kind === 'writeImport') updates.push(`${REL(op.path)} (add agentsmith import)`);
    else if (op.kind === 'removeImport') updates.push(`${REL(op.path)} (remove agentsmith import)`);
    else if (op.kind === 'keepStub' || op.kind === 'keepImport') keeps.push(REL(op.path));
  }
  const lines = ['agentsmith plan:'];
  if (writes.length) lines.push(`  write   ${writes.length} file(s): ${writes.slice(0, 3).join(', ')}${writes.length > 3 ? ', ...' : ''}`);
  for (const u of updates) lines.push(`  update  ${u}`);
  if (deletes.length) lines.push(`  DELETE  ${deletes.length} file(s): ${deletes.slice(0, 3).join(', ')}${deletes.length > 3 ? ', ...' : ''}`);
  for (const k of keeps) lines.push(`  keep    ${k} (unchanged)`);
  return lines.join('\n');
}
```

> Note on `commandPath`: when `absolute` is true (user scope) the execute layer resolves `HOOK_REL` against `base`; the plan carries the rel form and a flag, so `plan.js` stays pure. See Task 5.

- [ ] **Step 4: Run, verify pass**

Run: `node --test test/plan.test.js`
Expected: PASS. Fix any op-ordering mismatch so the assertions above hold.

- [ ] **Step 5: Commit**

```bash
git add src/plan.js test/plan.test.js
git commit -m "🤖 feat(cli): Add Plan builders and user-facing render"
```

---

### Task 5: `src/execute.js` -- apply a Plan to disk

**Files:**
- Create: `src/execute.js`
- Test: `test/execute.test.js` (create)

**Interfaces:**
- Produces: `applyPlan(plan, { pkgRoot, log }) -> void` -- performs each op under `plan.base`; `log` defaults to a stderr writer. Uses `resolve(base, rel)`; for `absolute` plans, `mergeSettings` command path is `resolve(base, HOOK_REL)`, else `HOOK_REL`.
- Consumes: `mergeSettings`, `agentsmithHooks`, `HOOK_REL` (settings.js); `userImport`, `userUnimport` (userimport.js); `pruneOrphans` (manifest.js); node fs.

- [ ] **Step 1: Write the failing test (temp-dir integration)**

Create `test/execute.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { applyPlan } from '../src/execute.js';

test('applyPlan writes, merges settings, then prune removes an orphan', () => {
  const base = mkdtempSync(join(tmpdir(), 'as-exec-'));
  try {
    const ghost = join(base, '.claude/x.md'); mkdirSync(dirname(ghost), { recursive: true }); writeFileSync(ghost, 'g');
    applyPlan({ base, absolute: false, manifestPaths: [], ops: [
      { kind: 'prune', paths: ['.claude/x.md'] },
      { kind: 'write', path: '.agentsmith/AGENTS.md', content: 'CORE' },
      { kind: 'mergeSettings', path: '.claude/settings.json', commandPath: '.claude/hooks/agentsmith/require-explicit-model.mjs' },
    ] }, { pkgRoot: process.cwd(), log: () => {} });
    assert.equal(existsSync(ghost), false, 'orphan pruned');
    assert.equal(readFileSync(join(base, '.agentsmith/AGENTS.md'), 'utf8'), 'CORE');
    const s = JSON.parse(readFileSync(join(base, '.claude/settings.json'), 'utf8'));
    assert.ok(JSON.stringify(s).includes('/hooks/agentsmith/'), 'hook merged');
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('applyPlan unmergeSettings leaves a malformed settings.json untouched', () => {
  const base = mkdtempSync(join(tmpdir(), 'as-exec-'));
  try {
    const s = join(base, '.claude/settings.json'); mkdirSync(dirname(s), { recursive: true }); writeFileSync(s, '{ not json');
    applyPlan({ base, absolute: false, manifestPaths: [], ops: [{ kind: 'unmergeSettings', path: '.claude/settings.json' }] }, { pkgRoot: process.cwd(), log: () => {} });
    assert.equal(readFileSync(s, 'utf8'), '{ not json', 'left untouched');
  } finally { rmSync(base, { recursive: true, force: true }); }
});
```

- [ ] **Step 2: Run, verify fail**

Run: `node --test test/execute.test.js`
Expected: FAIL -- module not found.

- [ ] **Step 3: Implement `src/execute.js`**

```js
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { mergeSettings, agentsmithHooks, HOOK_REL } from './settings.js';
import { userImport, userUnimport } from './userimport.js';
import { pruneOrphans } from './manifest.js';

const writeAbs = (dest, content, log) => {
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content);
  log(`agentsmith: wrote ${dest}`);
};

function editSettings(dest, owned, log) {
  let existing = null;
  if (existsSync(dest)) {
    try { existing = JSON.parse(readFileSync(dest, 'utf8')); }
    catch { log(`agentsmith: warning -- ${dest} is not valid JSON; left untouched`); return; }
  }
  const next = mergeSettings(existing, owned);
  writeAbs(dest, `${JSON.stringify(next, null, 2)}\n`, log);
}

function editImport(dest, target, remove, log) {
  const existing = existsSync(dest) ? readFileSync(dest, 'utf8') : null;
  const next = remove ? userUnimport(existing, target) : userImport(existing, target);
  if (next !== null) writeAbs(dest, next, log);
  else log(`agentsmith: ${remove ? 'no agentsmith import to remove in' : 'kept existing import in'} ${dest}`);
}

/** Apply a Plan to disk. Effectful. */
export function applyPlan(plan, { pkgRoot, log = (m) => process.stderr.write(`${m}\n`) }) {
  const { base, absolute } = plan;
  for (const op of plan.ops) {
    switch (op.kind) {
      case 'write': {
        const content = op.content !== undefined ? op.content : readFileSync(join(pkgRoot, op.src));
        writeAbs(resolve(base, op.path), content, log);
        break;
      }
      case 'prune': {
        const deleted = pruneOrphans(base, op.paths);
        if (deleted.length) log(`agentsmith: removed ${deleted.length} file(s)`);
        break;
      }
      case 'mergeSettings': {
        const commandPath = absolute ? resolve(base, HOOK_REL) : HOOK_REL;
        editSettings(resolve(base, op.path), agentsmithHooks(commandPath), log);
        break;
      }
      case 'unmergeSettings':
        editSettings(resolve(base, op.path), {}, log);
        break;
      case 'writeImport':
        editImport(resolve(base, op.path), resolve(base, op.target).replace(/\\/g, '/'), false, log);
        break;
      case 'removeImport':
        editImport(resolve(base, op.path), resolve(base, '.agentsmith/AGENTS.md').replace(/\\/g, '/'), true, log);
        break;
      case 'keepStub':
      case 'keepImport':
        log(`agentsmith: kept existing ${resolve(base, op.path)}`);
        break;
    }
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `node --test test/execute.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/execute.js test/execute.test.js
git commit -m "🤖 feat(cli): Add Plan executor"
```

---

### Task 6: `src/prompt.js` -- injected seam, confirmation, wizard

**Files:**
- Create: `src/prompt.js`
- Test: `test/prompt.test.js` (create)

**Interfaces:**
- Produces:
  - `confirm({ plan, seam, yes, dryRun, destructive, render }) -> Promise<'apply'|'skip'|'abort'>` -- `dryRun`->`skip`; `yes`->`apply`; TTY+no-yes->prompt (`apply` on `y`); non-TTY destructive+no-yes->`abort`; non-TTY non-destructive->`apply`.
  - `runWizard(seam) -> Promise<Command>` -- returns the same `Command` shape as `parseArgs`.
- Seam: `{ isTTY: boolean, ask: (question:string) => Promise<string> }`. Real seam (`makeSeam()`) wraps `process.stdout.isTTY` + `readline`.

- [ ] **Step 1: Write the failing tests (fake seam)**

Create `test/prompt.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirm, runWizard } from '../src/prompt.js';

const seamWith = (isTTY, answers) => {
  const q = [...answers];
  return { isTTY, ask: async () => q.shift() };
};
const plan = { ops: [] };
const render = () => 'PLAN';

test('dry-run -> skip', async () => {
  assert.equal(await confirm({ plan, seam: seamWith(true, []), yes: false, dryRun: true, destructive: false, render }), 'skip');
});
test('--yes -> apply', async () => {
  assert.equal(await confirm({ plan, seam: seamWith(false, []), yes: true, dryRun: false, destructive: true, render }), 'apply');
});
test('TTY prompt y -> apply, n -> skip', async () => {
  assert.equal(await confirm({ plan, seam: seamWith(true, ['y']), yes: false, dryRun: false, destructive: false, render }), 'apply');
  assert.equal(await confirm({ plan, seam: seamWith(true, ['n']), yes: false, dryRun: false, destructive: false, render }), 'skip');
});
test('non-TTY non-destructive -> apply; destructive -> abort', async () => {
  assert.equal(await confirm({ plan, seam: seamWith(false, []), yes: false, dryRun: false, destructive: false, render }), 'apply');
  assert.equal(await confirm({ plan, seam: seamWith(false, []), yes: false, dryRun: false, destructive: true, render }), 'abort');
});

test('wizard install path yields a parseable Command', async () => {
  // verb, scope, mode, placement, tools, dev
  const seam = seamWith(true, ['install', 'user', 'split', 'nested', 'y', 'n']);
  const cmd = await runWizard(seam);
  assert.equal(cmd.kind, 'install');
  assert.deepEqual(cmd.scope, { kind: 'user' });
  assert.equal(cmd.flags.tools, true);
  assert.equal(cmd.flags.dev, false);
});

test('wizard uninstall path skips install-only prompts', async () => {
  const seam = seamWith(true, ['uninstall', 'project']);
  const cmd = await runWizard(seam);
  assert.equal(cmd.kind, 'uninstall');
  assert.deepEqual(cmd.scope, { kind: 'project' });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `node --test test/prompt.test.js`
Expected: FAIL -- module not found.

- [ ] **Step 3: Implement `src/prompt.js`**

```js
import { createInterface } from 'node:readline';

/** Real terminal seam: TTY flag + a readline-backed ask. */
export function makeSeam() {
  return {
    isTTY: Boolean(process.stdout.isTTY),
    ask: (question) => new Promise((res) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, (a) => { rl.close(); res(a.trim()); });
    }),
  };
}

/** Decide apply/skip/abort for a plan. Prints the rendered plan first. */
export async function confirm({ plan, seam, yes, dryRun, destructive, render, log = (m) => process.stderr.write(`${m}\n`) }) {
  log(render(plan));
  if (dryRun) return 'skip';
  if (yes) return 'apply';
  if (!seam.isTTY) return destructive ? 'abort' : 'apply';
  const a = (await seam.ask(`Proceed? [y/N] `)).toLowerCase();
  return a === 'y' || a === 'yes' ? 'apply' : 'skip';
}

const yn = (a, dflt) => { const t = a.trim().toLowerCase(); if (t === '') return dflt; return t === 'y' || t === 'yes'; };

/** Interactive wizard -> Command (same shape parseArgs produces). */
export async function runWizard(seam) {
  const verb = (await seam.ask('Install or uninstall? [install]: ')).trim() || 'install';
  const scopeRaw = (await seam.ask('Scope -- project, user, or a path? [project]: ')).trim() || 'project';
  const scope = scopeRaw === 'user' ? { kind: 'user' } : scopeRaw === 'project' ? { kind: 'project' } : { kind: 'path', path: scopeRaw };

  if (verb === 'uninstall') {
    return { kind: 'uninstall', scope, flags: { yes: false, dryRun: false } };
  }
  const mode = (await seam.ask('Content -- split or single? [split]: ')).trim() || 'split';
  const placement = (await seam.ask('Placement -- nested or root? [nested]: ')).trim() || 'nested';
  const tools = yn(await seam.ask('Install tool adapters? [Y/n]: '), true);
  const dev = yn(await seam.ask('Install authoring dev tools? [y/N]: '), false);
  return { kind: 'install', scope, flags: { mode, placement, tools, dev, clean: false, yes: false, dryRun: false } };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `node --test test/prompt.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/prompt.js test/prompt.test.js
git commit -m "🤖 feat(cli): Add prompt seam, confirmation, and wizard"
```

---

### Task 7: Rewire `bin/cli.js` as the thin orchestrator + migrate build script

**Files:**
- Modify: `bin/cli.js` (replace the flag block and the install/user/stdout branches with the parse -> plan -> confirm -> apply pipeline)
- Modify: `package.json` (`build` script -> `node bin/cli.js install`)
- Test: covered by the migrated `test/cli.test.js` in Task 8 (this task's own gate is `npm test` staying green plus manual smoke).

**Interfaces:**
- Consumes: `parseArgs` (args.js), `buildInstallPlan`/`buildUninstallPlan`/`renderPlan` (plan.js), `applyPlan` (execute.js), `confirm`/`runWizard`/`makeSeam` (prompt.js), `readManifest`/`writeManifest` (manifest.js), `buildOutputs` (build.js), `resolveSections`/`makeListModules`/adapter listing (unchanged from today).

- [ ] **Step 1: Replace the flag block + branches in `bin/cli.js`**

Keep the top of the file (imports, `pkgRoot`, `manifest`, `listToolSources`, `makeListModules`, `resolveSections`, the `spec-index` early-exit, and the `buildOutputs` call producing `built`). Remove: the old `layout`/`placement`/`installTools`/`userScope`/`dev`/`--out` flag lines, the `writeAbs`/`installSettings`/`writeAdapters`/`adapterPlan` closures, and the three-way `--stdout`/`userScope`/`else` branch. Replace with:

```js
import { parseArgs } from '../src/args.js';
import { buildInstallPlan, buildUninstallPlan, renderPlan } from '../src/plan.js';
import { applyPlan } from '../src/execute.js';
import { confirm, runWizard, makeSeam } from '../src/prompt.js';
import { existsSync as fexists, readFileSync as fread, statSync } from 'node:fs';

const HELP = `agentsmith -- forge AGENTS.md for any project

Usage:
  agentsmith install   [--scope <user|project|PATH>] [--mode <single|split>] [--placement <root|nested>] [--no-tools] [--dev] [--clean] [--yes] [--dry-run]
  agentsmith uninstall [--scope <user|project|PATH>] [--yes] [--dry-run]
  agentsmith spec-index [--check]
  agentsmith --stdout  [--mode <single|split>]
  agentsmith                       (bare: interactive wizard)

Scope: 'project' (cwd, default), 'user' (home), or a directory path.
       A directory literally named user/project is reached as ./user.
Examples:
  agentsmith install
  agentsmith install --scope user
  agentsmith uninstall --scope user --yes`;

const pkgVersion = JSON.parse(fread(join(pkgRoot, 'package.json'), 'utf8')).version;

async function main() {
  let cmd = parseArgs(process.argv.slice(2));
  const seam = makeSeam();

  if (cmd.kind === 'wizard') {
    if (!seam.isTTY) { process.stderr.write(`agentsmith: error -- no subcommand -- run 'agentsmith install' or 'agentsmith --help'\n`); process.exit(1); }
    cmd = await runWizard(seam);
  }
  if (cmd.kind === 'error') { process.stderr.write(`${cmd.error}\n`); process.exit(1); }
  if (cmd.kind === 'help') { process.stdout.write(`${HELP}\n`); process.exit(0); }
  if (cmd.kind === 'version') { process.stdout.write(`${pkgVersion}\n`); process.exit(0); }
  if (cmd.kind === 'stdout') { process.stdout.write(built.coreContent); process.exit(0); }
  if (cmd.kind === 'spec-index') { /* unchanged: delegate to runSpecIndex, already handled at top */ }

  // Resolve scope -> base + absolute.
  const isUser = cmd.scope.kind === 'user';
  const base = isUser ? homedir() : cmd.scope.kind === 'path' ? resolve(process.cwd(), cmd.scope.path) : process.cwd();
  const absolute = isUser || cmd.scope.kind === 'path';
  if (cmd.scope.kind === 'path' && fexists(base) && !statSync(base).isDirectory()) {
    process.stderr.write(`agentsmith: error -- --scope path is not a directory: ${base}\n`); process.exit(1);
  }

  const prev = readManifest(base);

  let plan;
  if (cmd.kind === 'uninstall' || (cmd.kind === 'install' && cmd.flags.clean)) {
    const stubDest = resolve(base, 'AGENTS.md');
    const uninstallPlan = buildUninstallPlan({
      base, absolute, manifestPaths: prev.paths,
      stubContent: built.stub ? built.stub.content : null,
      stubOnDiskContent: fexists(stubDest) ? fread(stubDest, 'utf8') : null,
      hasSettings: fexists(resolve(base, '.claude/settings.json')),
      hasClaudeMd: fexists(resolve(base, '.claude/CLAUDE.md')),
      isUser,
    });
    plan = uninstallPlan;
    if (cmd.kind === 'uninstall') {
      const decision = await confirm({ plan, seam, yes: cmd.flags.yes, dryRun: cmd.flags.dryRun, destructive: true, render: renderPlan });
      if (decision === 'abort') { process.stderr.write(`agentsmith: error -- refusing to uninstall without confirmation -- pass --yes\n`); process.exit(1); }
      if (decision === 'skip') process.exit(0);
      applyPlan(plan, { pkgRoot });
      process.exit(0);
    }
    // install --clean: apply uninstall first (confirmed as destructive), then fall through to install.
    const decision = await confirm({ plan, seam, yes: cmd.flags.yes, dryRun: cmd.flags.dryRun, destructive: true, render: renderPlan });
    if (decision === 'abort') { process.stderr.write(`agentsmith: error -- refusing to clean-install without confirmation -- pass --yes\n`); process.exit(1); }
    if (decision === 'skip') process.exit(0);
    applyPlan(plan, { pkgRoot });
  }

  // install (fresh, or the install half of --clean).
  const adapterPlan = cmd.flags.tools ? computeAdapterPlan(cmd.flags.dev) : [];
  const installPlan = buildInstallPlan({
    base, absolute, built, adapterPlan, scope: cmd.scope, flags: cmd.flags,
    prevManifestPaths: readManifest(base).paths, stubExists: fexists(resolve(base, 'AGENTS.md')),
  });
  const decision = await confirm({ plan: installPlan, seam, yes: cmd.flags.yes, dryRun: cmd.flags.dryRun, destructive: false, render: renderPlan });
  if (decision === 'skip') process.exit(0);
  applyPlan(installPlan, { pkgRoot });
  writeManifest(base, installPlan.manifestPaths, new Date().toISOString());
}

// computeAdapterPlan wraps today's listToolSources + planToolInstall (dev adds devtools/claude).
function computeAdapterPlan(dev) {
  const sources = listToolSources(join(pkgRoot, 'tools'), 'tools');
  if (dev) sources.push(...listToolSources(join(pkgRoot, 'devtools', 'claude'), 'devtools/claude'));
  return planToolInstall(sources);
}

main().catch((e) => { process.stderr.write(`agentsmith: ${e.message}\n`); process.exit(1); });
```

Notes for the implementer:
- The `spec-index` early-exit already lives at the top of `bin/cli.js` and runs before `main()`; leave it. The `cmd.kind === 'spec-index'` branch inside `main()` is unreachable and can be omitted -- keep the top-level handler.
- `built` is computed once (unchanged code above `main`) and closed over; `--mode`/`--placement` must feed `buildOutputs`. Wire `layout = cmd.flags.mode === 'single' ? 'full' : 'lean'` and `placement = cmd.flags.placement` -- but `built` is currently built before parsing. **Reorder:** parse first, then build `built` from `cmd.flags` (move the `buildOutputs` call into `main` after `cmd` is resolved, or compute layout/placement from a pre-parse). Simplest: parse at top, then build. Ensure `--stdout --mode single` still produces the full inline core.
- Keep the existing `built.dangling` / `built.crossBoundary` warnings.

- [ ] **Step 2: Migrate the `build` script**

In `package.json`, change `"build": "node bin/cli.js"` to `"build": "node bin/cli.js install"`.

- [ ] **Step 3: Smoke-test manually**

```bash
node bin/cli.js --help          # prints usage, exit 0
node bin/cli.js --version       # prints 1.0.0-rc.17
node bin/cli.js --stdout | head # prints core, no writes
node bin/cli.js install --dry-run   # prints plan, writes nothing
```
Expected: each behaves as labelled; `--dry-run` leaves the tree unchanged (`git status` clean apart from intended).

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: the pre-existing `test/cli.test.js` cases that call bare `run(dir)` / `--user` **fail now** (they use the old surface). That is expected and fixed in Task 8. All Task 1-6 unit suites stay green.

- [ ] **Step 5: Commit**

```bash
git add bin/cli.js package.json
git commit -m "🤖 feat(cli): Rewire cli.js as thin parse/plan/confirm/apply orchestrator"
```

---

### Task 8: Migrate `test/cli.test.js` + add coexistence and clean tests

**Files:**
- Modify: `test/cli.test.js` (migrate invocations; add tests)

**Interfaces:**
- Consumes: the new CLI surface (`install`, `uninstall`, `--scope user`, `--dev`, `--no-tools`, `--yes`, `--dry-run`).

- [ ] **Step 1: Migrate the run helpers**

```js
function run(cwd, args = []) { execFileSync('node', [cli, 'install', ...args], { cwd }); }
function runUser(cwd, home, args = []) {
  execFileSync('node', [cli, 'install', '--scope', 'user', ...args], { cwd, env: { ...process.env, HOME: home, USERPROFILE: home } });
}
```
Every existing `run(dir, ['--no-tools'])` / `run(dir, ['--dev'])` now targets `install --no-tools` / `install --dev` unchanged. The `--user` tests flow through `runUser`. Non-TTY installs auto-proceed (non-destructive), so no `--yes` is needed for `install`.

- [ ] **Step 2: Add the unknown-flag regression (bug 2)**

```js
test('an unknown flag exits non-zero (bug 2: ----no-tools must not silently full-install)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    assert.throws(() => execFileSync('node', [cli, 'install', '----no-tools'], { cwd: dir, stdio: 'ignore' }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
```

- [ ] **Step 3: Add the stale-hook regression (bug 1)**

```js
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
```

- [ ] **Step 4: Add uninstall, clean, and coexistence tests**

```js
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
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS -- all migrated + new cli tests green, all Task 1-6 unit suites green.

- [ ] **Step 6: Commit**

```bash
git add test/cli.test.js
git commit -m "🤖 test(cli): Migrate to subcommands; cover bugs, uninstall, clean, coexistence"
```

---

### Task 9: Documentation -- reference-spec, README, command docs, debt deletion

**Files:**
- Create: `docs/reference-spec/cli.md`
- Modify: `README.md` (Usage rewrite)
- Modify: `CONTRIBUTING.md` (`--dev` invocation)
- Modify: `tools/claude/commands/agentsmith-init.md` (bare/`--user` -> `install` / `install --scope user`)
- Modify: `devtools/claude/commands/instruction-apply.md` and `devtools/claude/skills/instruction-review-board/SKILL.md` (regenerate `node bin/cli.js` -> `node bin/cli.js install`)
- Delete: `docs/technical-debts/2026-06-02-stale-user-import.md`

- [ ] **Step 1: Create `docs/reference-spec/cli.md`**

Write the present-truth CLI surface: the three subcommands and their flags, the three axes (`--scope`/`--mode`/`--placement`), `--stdout`/`--help`/`--version`, the confirmation gate (verb-class table), the wizard, and a **Plugin coexistence** section (disjoint paths, manifest-bound prune, settings-vs-plugin.json, the explicit assumption). Keep it descriptive of current behavior (no `Status:` line -- reference-spec docs have no lifecycle). One sentence per line.

- [ ] **Step 2: Rewrite the README Usage section**

Replace the flag list ([README.md:35-46](../../../README.md)) with the subcommand model; change the one-liner to `npx github:viniciussegura/agentsmith install`; document every subcommand/flag with an example; delete the `--out`/`--full`/`--inline`/`--root`/`--user` lines; add the `--no-tools`-beside-plugin coexistence note; link `docs/reference-spec/cli.md` for detail.

- [ ] **Step 3: Update CONTRIBUTING and the command/skill docs**

- `CONTRIBUTING.md`: `node bin/cli.js --dev` -> `node bin/cli.js install --dev` ([CONTRIBUTING.md:64,81](../../../CONTRIBUTING.md)); `npm run build -- --stdout` stays valid.
- `tools/claude/commands/agentsmith-init.md:14`: `node bin/cli.js` -> `node bin/cli.js install`; `node bin/cli.js --user` -> `node bin/cli.js install --scope user`.
- `devtools/claude/commands/instruction-apply.md:23` and `devtools/claude/skills/instruction-review-board/SKILL.md:128`: regenerate `node bin/cli.js` -> `node bin/cli.js install`.

- [ ] **Step 4: Delete the closed technical-debt file**

```bash
git rm docs/technical-debts/2026-06-02-stale-user-import.md
```
(If Task 1's `userUnimport` left a residual -- e.g. it cannot match a hand-edited import -- narrow the file to that residual instead of deleting; per Task 1 the round-trip test passing means the debt is closed.)

- [ ] **Step 5: Verify no stale references remain**

Run: `grep -rn "bin/cli.js" README.md CONTRIBUTING.md tools/ devtools/ | grep -v -- "--stdout" | grep -v "install"`
Expected: no live bare `node bin/cli.js` invocation remains (frozen `docs/working-specs/*` excluded by scope).

- [ ] **Step 6: Regenerate the working-specs index and run the full gate**

Run: `node bin/cli.js spec-index && npm test && npm run check:index`
Expected: index current, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "🤖 docs(cli): Add CLI reference-spec, rewrite README, migrate consumers"
```

---

## Definition of done (#swe-done)

- [ ] `npm test` green locally, including the two bug regressions, uninstall, `--clean`, and coexistence tests.
- [ ] README + CONTRIBUTING + command/skill docs migrated; `docs/reference-spec/cli.md` created; stale-user-import debt deleted.
- [ ] `npm run check:index` passes; `docs/working-specs/INDEX.md` current.
- [ ] No unused deps introduced; `--out` removal leaves no dead `buildOutputs({out})` wiring (drop the `out` param from `src/build.js` if nothing references it, in Task 7 or 9).
- [ ] Plan pruned or marked `Implemented` per #ai-plan once merged.
- [ ] Self-review against instructions; a non-trivial diff -> independent review pass (#ai-review-board) before squash-merge.
