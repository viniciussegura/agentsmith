# Installer Prune Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a generator run leave exactly the files the current sources produce — pruning orphans from a prior run — without ever deleting a file agentsmith did not generate.

**Architecture:** A new pure-ish module `src/manifest.js` records every path agentsmith fully writes this run to `.agentsmith/.install-manifest.json`. `bin/cli.js` computes the current path set up front, prunes `previous − current` (bounded to recorded paths), writes the files, then writes the new manifest. Merge targets (`settings.json`) and write-once files (the root `AGENTS.md` stub) are never recorded and never pruned.

**Tech Stack:** Node.js ESM, `node:fs`, `node --test`. Zero new dependencies.

## Global Constraints

- The prune is bounded to paths recorded in the previous manifest; it **MUST NOT** delete any path agentsmith did not record writing (`#ai-tool-safety`).
- `settings.json` (merged, not owned) and the root `AGENTS.md` stub (write-once, consumer-owned) are **never** in the manifest and **never** pruned.
- The manifest lives at `.agentsmith/.install-manifest.json` (already gitignored).
- Pruning is an automatic, bounded part of a normal install — not a separate command (Non-goals).
- `generatedAt` is injected by the caller so tests stay deterministic (`#swe-testing`).
- A missing/malformed manifest prunes nothing (first run / deleted manifest is safe, never an error).

---

### Task 1: `src/manifest.js` + unit tests

**Files:**
- Create: `src/manifest.js`
- Test: `test/manifest.test.js`

**Interfaces:**
- Produces:
  - `manifestPath(base: string): string` — absolute path to the manifest.
  - `readManifest(base: string): { version: number, paths: string[] }` — empty `paths` on missing/malformed.
  - `orphanPaths(prevPaths: string[], currentPaths: string[]): string[]` — pure set difference `prev − current`.
  - `pruneOrphans(base: string, orphans: string[]): string[]` — deletes each existing orphan + emptied parent dirs; returns rel paths deleted.
  - `writeManifest(base: string, paths: string[], generatedAt: string): string` — writes sorted+deduped manifest; returns path.
  - `MANIFEST_REL = '.agentsmith/.install-manifest.json'`.

- [ ] **Step 1: Write the failing tests**

```js
// test/manifest.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  manifestPath, readManifest, orphanPaths, pruneOrphans, writeManifest, MANIFEST_REL,
} from '../src/manifest.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'agentsmith-mf-'));

test('orphanPaths is the pure set difference prev - current', () => {
  assert.deepEqual(
    orphanPaths(['a', 'b', 'c'], ['b', 'd']),
    ['a', 'c'],
  );
  assert.deepEqual(orphanPaths([], ['x']), []);
  assert.deepEqual(orphanPaths(['x'], []), ['x']);
});

test('readManifest returns empty paths when absent or malformed', () => {
  const base = tmp();
  try {
    assert.deepEqual(readManifest(base), { version: 1, paths: [] });
    mkdirSync(join(base, '.agentsmith'), { recursive: true });
    writeFileSync(manifestPath(base), 'not json{');
    assert.deepEqual(readManifest(base), { version: 1, paths: [] });
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('writeManifest then readManifest round-trips, sorted and deduped', () => {
  const base = tmp();
  try {
    writeManifest(base, ['b/x.md', 'a.md', 'b/x.md'], '2026-06-26T00:00:00.000Z');
    assert.equal(existsSync(manifestPath(base)), true);
    const m = readManifest(base);
    assert.deepEqual(m.paths, ['a.md', 'b/x.md']);
    assert.equal(m.version, 1);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('pruneOrphans deletes only listed paths and removes emptied dirs', () => {
  const base = tmp();
  try {
    // a recorded orphan in its own dir, plus an unrelated consumer file
    mkdirSync(join(base, '.claude/commands'), { recursive: true });
    writeFileSync(join(base, '.claude/commands/agentsmith-ghost.md'), 'ghost');
    writeFileSync(join(base, '.claude/commands/my-own.md'), 'mine');

    const deleted = pruneOrphans(base, ['.claude/commands/agentsmith-ghost.md']);
    assert.deepEqual(deleted, ['.claude/commands/agentsmith-ghost.md']);
    assert.equal(existsSync(join(base, '.claude/commands/agentsmith-ghost.md')), false, 'orphan deleted');
    assert.equal(existsSync(join(base, '.claude/commands/my-own.md')), true, 'unlisted consumer file spared');
    // dir still has my-own.md, so it must NOT be removed
    assert.equal(existsSync(join(base, '.claude/commands')), true, 'non-empty dir kept');
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('pruneOrphans removes a directory the deletion emptied', () => {
  const base = tmp();
  try {
    mkdirSync(join(base, '.claude/skills/agentsmith-old'), { recursive: true });
    writeFileSync(join(base, '.claude/skills/agentsmith-old/SKILL.md'), 'x');
    pruneOrphans(base, ['.claude/skills/agentsmith-old/SKILL.md']);
    assert.equal(existsSync(join(base, '.claude/skills/agentsmith-old')), false, 'emptied dir removed');
    assert.equal(existsSync(join(base, '.claude/skills')), true, 'ancestor with siblings kept (or base kept)');
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('pruneOrphans is a no-op for a path that no longer exists', () => {
  const base = tmp();
  try {
    assert.deepEqual(pruneOrphans(base, ['.claude/commands/gone.md']), []);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/manifest.test.js`
Expected: FAIL — `Cannot find module '../src/manifest.js'`.

- [ ] **Step 3: Implement `src/manifest.js`**

```js
// src/manifest.js
// Install manifest: records the files agentsmith generated this run so the next
// run can prune orphans (paths a prior run wrote that the current sources no
// longer produce) WITHOUT ever deleting a path agentsmith did not record writing
// (#ai-tool-safety). Lives at .agentsmith/.install-manifest.json (gitignored).
import {
  readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, readdirSync, rmdirSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

export const MANIFEST_REL = '.agentsmith/.install-manifest.json';

export function manifestPath(base) {
  return resolve(base, MANIFEST_REL);
}

// Missing or malformed -> empty path set (a first run, or a user who deleted the
// manifest, simply prunes nothing this cycle; never an error).
export function readManifest(base) {
  const p = manifestPath(base);
  if (!existsSync(p)) return { version: 1, paths: [] };
  try {
    const m = JSON.parse(readFileSync(p, 'utf8'));
    return { version: m.version ?? 1, paths: Array.isArray(m.paths) ? m.paths : [] };
  } catch {
    return { version: 1, paths: [] };
  }
}

// Pure: orphans to prune = recorded-previous minus current (order-stable on prev).
export function orphanPaths(prevPaths, currentPaths) {
  const cur = new Set(currentPaths);
  return prevPaths.filter((p) => !cur.has(p));
}

// Delete each orphan that still exists under base, then remove parent dirs the
// deletion left empty, climbing toward (never removing) base. Returns the rel
// paths actually deleted. Bounded to `orphans` — never touches an unlisted path.
export function pruneOrphans(base, orphans) {
  const root = resolve(base);
  const deleted = [];
  for (const rel of orphans) {
    const abs = resolve(base, rel);
    if (!existsSync(abs)) continue;
    rmSync(abs, { force: true });
    deleted.push(rel);
    let dir = dirname(abs);
    while (dir !== root && dir.startsWith(root)) {
      try {
        if (readdirSync(dir).length > 0) break;
        rmdirSync(dir);
        dir = dirname(dir);
      } catch {
        break;
      }
    }
  }
  return deleted;
}

// Write the new manifest (sorted, deduped). generatedAt is injected by the caller
// so tests stay deterministic.
export function writeManifest(base, paths, generatedAt) {
  const p = manifestPath(base);
  mkdirSync(dirname(p), { recursive: true });
  const sorted = [...new Set(paths)].sort();
  writeFileSync(p, `${JSON.stringify({ version: 1, generatedAt, paths: sorted }, null, 2)}\n`);
  return p;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/manifest.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/manifest.js test/manifest.test.js
git commit -m "feat(manifest): install-manifest module (read/orphan/prune/write) + tests"
```

---

### Task 2: Wire prune + manifest into `bin/cli.js`

**Files:**
- Modify: `bin/cli.js` (the `installAdapters` helper and the two write branches — user-scope and cwd-scope)
- Test: `test/cli.test.js` (add prune assertions)

**Interfaces:**
- Consumes from Task 1: `readManifest`, `orphanPaths`, `pruneOrphans`, `writeManifest`.
- Current `bin/cli.js` shape: a `writeAbs(dest, content)` helper; `installSettings(base, {absolute})`; `installAdapters(base, {absolute})` that lists `tools/` (+ `devtools/claude` under `--dev`) sources, calls `planToolInstall(sources)` → `{src,dest}[]`, `writeAbs`-es each, then `installSettings`. Two branches write the outputs: the `--user` branch (`base = homedir()`) and the default cwd branch (`base = process.cwd()`), each writing `built.corePath`, each `built.bundles[].path`, the cwd branch also the root stub; both call `installAdapters`.

- [ ] **Step 1: Add the failing prune test**

Append to `test/cli.test.js`:

```js
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
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node --test test/cli.test.js`
Expected: FAIL — the manifest file does not exist yet (`readFileSync` on `.install-manifest.json` throws), and the ghost is not pruned.

- [ ] **Step 3: Add the import**

At the top of `bin/cli.js`, with the other `../src/*` imports:

```js
import { readManifest, orphanPaths, pruneOrphans, writeManifest } from '../src/manifest.js';
```

- [ ] **Step 4: Split adapter planning from writing**

Replace the existing `installAdapters` helper with a pure planner + a writer, so the current path set is known before any write:

```js
// Plan the adapter install (pure: no disk writes). tools/<ai>/** always; the
// authoring devtools/claude/** only under --dev. Returns planToolInstall's
// { src, dest }[].
const adapterPlan = () => {
  if (!installTools) return [];
  const sources = listToolSources(join(pkgRoot, 'tools'), 'tools');
  if (dev) sources.push(...listToolSources(join(pkgRoot, 'devtools', 'claude'), 'devtools/claude'));
  return planToolInstall(sources);
};

// Write the planned adapter files, then wire settings (after the hook script is
// on disk). settings.json is a MERGE target — deliberately NOT a manifest path.
const writeAdapters = (base, plan, { absolute }) => {
  for (const { src, dest } of plan) {
    writeAbs(resolve(base, dest), readFileSync(join(pkgRoot, src)));
  }
  installSettings(base, { absolute });
};
```

- [ ] **Step 5: Prune + manifest in the cwd branch**

In the default (non-`--user`, non-`--stdout`) branch, replace the body so it prunes before writing and writes the manifest after. The root stub and `settings.json` are excluded from `currentPaths`:

```js
} else {
  const cwd = process.cwd();
  const plan = adapterPlan();
  // Files agentsmith fully owns this run: core + bundles + adapter files.
  // EXCLUDES the root stub (write-once) and settings.json (merged).
  const currentPaths = [
    built.corePath,
    ...built.bundles.map((b) => b.path),
    ...plan.map((p) => p.dest),
  ];
  const prev = readManifest(cwd);
  const pruned = pruneOrphans(cwd, orphanPaths(prev.paths, currentPaths));
  if (pruned.length) process.stderr.write(`agentsmith: pruned ${pruned.length} orphaned file(s)\n`);

  writeAbs(resolve(cwd, built.corePath), built.coreContent);
  for (const bundle of built.bundles) writeAbs(resolve(cwd, bundle.path), bundle.content);

  if (built.stub) {
    const stubDest = resolve(cwd, built.stub.path);
    if (existsSync(stubDest)) {
      process.stderr.write(`agentsmith: kept existing ${stubDest}\n`);
    } else {
      writeAbs(stubDest, built.stub.content);
    }
  }

  writeAdapters(cwd, plan, { absolute: false });
  writeManifest(cwd, currentPaths, new Date().toISOString());
}
```

- [ ] **Step 6: Prune + manifest in the `--user` branch**

In the `--user` branch (`base = homedir()`), apply the same pattern. The user branch writes core + bundles + adapters (no root stub; the `~/.claude/CLAUDE.md` import is a merge target, excluded):

```js
  const base = homedir();
  const plan = adapterPlan();
  const currentPaths = [
    built.corePath,
    ...built.bundles.map((b) => b.path),
    ...plan.map((p) => p.dest),
  ];
  const prev = readManifest(base);
  const pruned = pruneOrphans(base, orphanPaths(prev.paths, currentPaths));
  if (pruned.length) process.stderr.write(`agentsmith: pruned ${pruned.length} orphaned file(s)\n`);

  writeAbs(resolve(base, built.corePath), built.coreContent);
  for (const bundle of built.bundles) writeAbs(resolve(base, bundle.path), bundle.content);

  // Wire the CLAUDE.md import before installing adapters (unchanged), then:
  const claudeMd = resolve(base, '.claude/CLAUDE.md');
  const target = resolve(base, built.corePath).replace(/\\/g, '/');
  const existing = existsSync(claudeMd) ? readFileSync(claudeMd, 'utf8') : null;
  const next = userImport(existing, target);
  if (next !== null) writeAbs(claudeMd, next);
  else process.stderr.write(`agentsmith: kept existing import in ${claudeMd}\n`);

  writeAdapters(base, plan, { absolute: true });
  writeManifest(base, currentPaths, new Date().toISOString());
```

(The `--stdout` branch is unchanged — it writes nothing, so it neither prunes nor writes a manifest.)

- [ ] **Step 7: Run the full suite**

Run: `node --test`
Expected: PASS — all prior tests plus the two new prune tests. If any pre-existing test asserts the exact set of files written, confirm it still holds (the manifest is a new file under `.agentsmith/`, not asserted by the existing "default run" tests).

- [ ] **Step 8: Verify dogfood + manifest content**

Run: `node bin/cli.js --dev && cat .agentsmith/.install-manifest.json | head -5`
Expected: the manifest lists the core, bundles, and the `agentsmith-`-prefixed adapter command paths; it does **not** list `.claude/settings.json` or the root `AGENTS.md`.

- [ ] **Step 9: Resolve docs drift + commit**

Per `#swe-docs-drift`, check `README.md` / `CONTRIBUTING.md` for any statement that the installer "only writes" — none currently claims that, so no doc change is expected; confirm and proceed.

```bash
git add bin/cli.js test/cli.test.js
git commit -m "feat(cli): prune orphaned generated files via install manifest"
```

---

## Self-Review

**Spec coverage:** §A manifest (Task 1 `writeManifest`/`readManifest`), §B prune step (Task 1 `orphanPaths`+`pruneOrphans`, Task 2 wiring), §C exclusions (Task 2 `currentPaths` excludes stub + settings; Task 1 test asserts unlisted survival), §D first-run/missing manifest (Task 1 `readManifest` empty default + test), success criteria (Task 2 tests: orphan pruned, consumer spared, settings/stub kept). Covered.

**Placeholder scan:** none — every step carries complete code or an exact command.

**Type consistency:** `currentPaths: string[]` (rel paths) feeds `orphanPaths`/`pruneOrphans`/`writeManifest` consistently; `adapterPlan()` returns `{src,dest}[]` matching `planToolInstall`; `readManifest().paths` is `string[]`.
