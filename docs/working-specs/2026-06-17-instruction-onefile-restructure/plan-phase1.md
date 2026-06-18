# One-file-per-tag restructure — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the instruction sources from a few multi-rule files to one markdown file per `#tag` under group directories, with the generator emitting byte-identical output.

**Architecture:** Extend the existing generator (it already maps dir→section→bundle and demotes headings). Make the resolver tree-aware and demotion role-based (`_intro.md` +1, tag file +2); each `_intro.md` preserves its source file's leading h1 verbatim. Two reviewed pre-steps (reorder rules alphabetically, normalize whitespace) make the final split a strict empty-diff migration.

**Tech Stack:** Node ESM, `node --test`, no runtime deps (hand-rolled markdown/YAML scanning in `src/`).

**Spec:** `docs/working-specs/2026-06-17-instruction-onefile-restructure/spec.md` (Phase 1 = §1.1–§1.4).

---

## File structure

- Modify `src/generate.js` — `demoteHeadings(md, by)` takes a level count; `generate()` accepts per-module demote.
- Modify `src/sections.js` — `resolveSections` passes through `{path, demote}` module descriptors.
- Modify `bin/cli.js` — replace `listFiles` with a recursive `listModules` yielding `{path, demote}`; read into `{text, demote}`.
- Modify `src/build.js` — thread `{text, demote}` modules into `generate`.
- Modify `src/bundles.js` — add a lowercase-leading tag-filename lint to `ownershipCoverage` inputs (or a new check).
- Create `devtools/restructure/reorder.mjs` — one-time: sort `## #tag` sections alphabetically within each current file.
- Create `devtools/restructure/migrate-tree.mjs` — one-time: split files into `<section>/<group>/<tag>.md` + `_intro.md`.
- Create `devtools/restructure/gate.mjs` — capture `--stdout`/`--full`/bundles pre vs post; assert empty.
- Modify test files: `test/generate.test.js`, `test/sections.test.js`, `test/build.test.js`; create `test/list-modules.test.js`.

`devtools/restructure/` is dev-only (never installed/published — same exclusion as `devtools/triage-ui/`, proven by `test/triage-export.test.mjs`; extend that test to cover the new dir).

---

## Task 1: `demoteHeadings` takes a level count

**Files:**
- Modify: `src/generate.js` (the `demoteHeadings` function)
- Test: `test/generate.test.js`

- [ ] **Step 1: Write the failing test**

Add to `test/generate.test.js`:

```js
import { demoteHeadings } from '../src/generate.js';

test('demoteHeadings shifts by N levels and clamps at h6', () => {
  assert.equal(demoteHeadings('# A', 2), '### A');
  assert.equal(demoteHeadings('## B', 2), '#### B');
  assert.equal(demoteHeadings('##### E', 2), '###### E'); // clamp 5+2 -> 6
  assert.equal(demoteHeadings('###### F', 2), '###### F'); // already h6
  assert.equal(demoteHeadings('# A', 1), '## A');          // default-equivalent
});

test('demoteHeadings leaves fenced headings untouched at by=2', () => {
  const out = demoteHeadings('# T\n\n```md\n# X\n```', 2);
  assert.match(out, /^### T$/m);
  assert.match(out, /^# X$/m);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/generate.test.js`
Expected: FAIL — `demoteHeadings` is not exported, and/or by-2 not supported.

- [ ] **Step 3: Implement**

In `src/generate.js`, export `demoteHeadings` and generalize it:

```js
export function demoteHeadings(markdown, by = 1) {
  if (by <= 0) return String(markdown);
  let inFence = false;
  return String(markdown)
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      if (inFence) return line;
      return line.replace(/^(#{1,6})(\s)/, (_m, hashes, sp) => '#'.repeat(Math.min(6, hashes.length + by)) + sp);
    })
    .join('\n');
}
```

(Was `function demoteHeadings(markdown)` with `/^(#{1,5})(\s)/ -> "#$1$2"`. The new form is backward-identical for `by=1`: h1–h5 gain one `#`, h6 clamps to h6 as before.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/generate.test.js`
Expected: PASS (all generate tests, including the pre-existing demote-by-one test).

- [ ] **Step 5: Commit**

```bash
git add src/generate.js test/generate.test.js
git commit -m "$(printf '%s' '🤖 refactor(generate): demoteHeadings takes a level count

Usage: model=claude-opus-4-8[1m]
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2: `generate()` accepts per-module demote

**Files:**
- Modify: `src/generate.js` (the `generate` function block assembly)
- Test: `test/generate.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('generate accepts {text, demote} module items', () => {
  const out = generate({
    preamble: '# Root',
    modules: [
      { text: '# Group\n\nprose', demote: 1 },
      { text: '# #tag Title\n\nbody', demote: 2 },
    ],
    source: 's',
  });
  assert.match(out, /^# Root$/m);
  assert.match(out, /^## Group$/m);      // _intro: h1 -> h2
  assert.match(out, /^### #tag Title$/m); // tag: h1 -> h3
});

test('generate still accepts plain-string modules (demote 1)', () => {
  const out = generate({ preamble: '# R', modules: ['# G\n\nx'], source: 's' });
  assert.match(out, /^## G$/m);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/generate.test.js`
Expected: FAIL — string modules currently demote by 1, but `{text, demote}` objects are stringified, not demoted.

- [ ] **Step 3: Implement**

In `src/generate.js` `generate()`, replace the `blocks` construction:

```js
  const norm = (m) => (typeof m === 'string' ? { text: m, demote: 1 } : m);
  const blocks = [String(preamble), ...modules.map(norm).map((m) => demoteHeadings(m.text, m.demote))]
    .map((block) => block.trim())
    .filter(Boolean);
```

(Preamble is never demoted — it owns the root h1. A plain string keeps the legacy demote-by-1.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/generate.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/generate.js test/generate.test.js
git commit -m "$(printf '%s' '🤖 refactor(generate): per-module demote level

Usage: model=claude-opus-4-8[1m]
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 3: recursive `listModules` + `resolveSections` pass-through

**Files:**
- Modify: `bin/cli.js` (replace `listFiles` with `listModules`; pass `listModules` to `resolveSections`)
- Modify: `src/sections.js` (`resolveSections` yields `{path, demote}` descriptors)
- Test: `test/sections.test.js`, create `test/list-modules.test.js`

- [ ] **Step 1: Write the failing test (resolveSections pass-through)**

Rewrite the descriptors in `test/sections.test.js` to `{path, demote}`. Replace the first test's body:

```js
test('splits no-when sections into core and when sections into bundles', () => {
  const listModules = (name) =>
    ({
      core: [{ path: 'core/swe/_intro.md', demote: 1 }, { path: 'core/swe/swe-x.md', demote: 2 }],
      frontend: [{ path: 'frontend/front/_intro.md', demote: 1 }],
    })[name] || [];

  const { coreModules, bundles } = resolveSections({
    sections: [
      { name: 'core' },
      { name: 'frontend', title: 'Front-end instructions', when: 'Front-end or UI work' },
    ],
    listModules,
  });

  assert.deepEqual(coreModules, [
    { path: 'core/swe/_intro.md', demote: 1 },
    { path: 'core/swe/swe-x.md', demote: 2 },
  ]);
  assert.equal(bundles.length, 1);
  assert.deepEqual(bundles[0], {
    name: 'frontend',
    title: 'Front-end instructions',
    when: 'Front-end or UI work',
    modules: [{ path: 'frontend/front/_intro.md', demote: 1 }],
  });
});
```

Update the other three `sections.test.js` tests the same way: `listFiles`→`listModules`, returned arrays hold `{path, demote}`, assert on `coreModules`/`bundles[].modules`. For the `modules`-override test, the override is still a string[] of paths; assert it is mapped to descriptors with demote derived from basename:

```js
test('an explicit modules list overrides listModules, demote from basename', () => {
  let called = false;
  const listModules = () => { called = true; return [{ path: 'X', demote: 9 }]; };
  const { coreModules } = resolveSections({
    sections: [{ name: 'core', modules: ['core/swe/_intro.md', 'core/swe/swe-a.md'] }],
    listModules,
  });
  assert.deepEqual(coreModules, [
    { path: 'core/swe/_intro.md', demote: 1 },
    { path: 'core/swe/swe-a.md', demote: 2 },
  ]);
  assert.equal(called, false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/sections.test.js`
Expected: FAIL — `resolveSections` still returns `coreModulePaths`/`modulePaths` of strings and reads `listFiles`.

- [ ] **Step 3: Implement `resolveSections`**

Rewrite `src/sections.js`:

```js
const demoteForPath = (p) => (p.split('/').pop() === '_intro.md' ? 1 : 2);

export function resolveSections({ sections = [], listModules }) {
  const coreModules = [];
  const bundles = [];
  for (const section of sections) {
    const mods = section.modules
      ? section.modules.map((path) => ({ path, demote: demoteForPath(path) }))
      : listModules(section.name);
    if (section.when == null) {
      coreModules.push(...mods);
    } else {
      bundles.push({ name: section.name, title: section.title, when: section.when, modules: mods });
    }
  }
  return { coreModules, bundles };
}
```

- [ ] **Step 4: Write the failing test (`listModules`) — create `test/list-modules.test.js`**

`listModules` does disk I/O, so test it against a temp tree:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeListModules } from '../bin/cli.js';

test('listModules: branch dir recurses alpha; _intro first; demote by role', () => {
  const root = mkdtempSync(join(tmpdir(), 'lm-'));
  try {
    // core/ (branch) -> ai/ , swe/  ; backend/ (leaf)
    mkdirSync(join(root, 'instructions/core/swe'), { recursive: true });
    mkdirSync(join(root, 'instructions/core/ai'), { recursive: true });
    mkdirSync(join(root, 'instructions/backend'), { recursive: true });
    for (const [p, c] of [
      ['instructions/core/swe/_intro.md', '# SWE'],
      ['instructions/core/swe/swe-reuse.md', '# #swe-reuse'],
      ['instructions/core/swe/swe-async.md', '# #swe-async'],
      ['instructions/core/ai/_intro.md', '# AI'],
      ['instructions/core/ai/ai-plan.md', '# #ai-plan'],
      ['instructions/backend/_intro.md', '# Back-end instructions'],
      ['instructions/backend/be-api-first.md', '# #be-api-first'],
    ]) writeFileSync(join(root, p), c);

    const listModules = makeListModules(root);
    assert.deepEqual(listModules('core'), [
      { path: 'instructions/core/ai/_intro.md', demote: 1 },
      { path: 'instructions/core/ai/ai-plan.md', demote: 2 },
      { path: 'instructions/core/swe/_intro.md', demote: 1 },
      { path: 'instructions/core/swe/swe-async.md', demote: 2 },
      { path: 'instructions/core/swe/swe-reuse.md', demote: 2 },
    ]);
    assert.deepEqual(listModules('backend'), [
      { path: 'instructions/backend/_intro.md', demote: 1 },
      { path: 'instructions/backend/be-api-first.md', demote: 2 },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `node --test test/list-modules.test.js`
Expected: FAIL — `makeListModules` not exported.

- [ ] **Step 6: Implement `listModules` in `bin/cli.js`**

Replace the `listFiles` definition with an exported factory (so it is testable against a temp root) and wire it:

```js
// Recursive module lister: ordered { path, demote } for a section's subtree.
// A branch dir (only subdirs) recurses alphabetically; a leaf dir emits
// _intro.md first then tag files alphabetically. demote: _intro -> 1, tag -> 2.
export function makeListModules(root) {
  return function listModules(name) {
    const out = [];
    const walk = (absDir, relDir) => {
      const entries = readdirSync(absDir, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
      if (dirs.length) {
        for (const d of dirs) walk(join(absDir, d), `${relDir}/${d}`);
        return;
      }
      const files = entries.filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name);
      const ordered = files.filter((f) => f === '_intro.md')
        .concat(files.filter((f) => f !== '_intro.md').sort());
      for (const f of ordered) out.push({ path: `${relDir}/${f}`, demote: f === '_intro.md' ? 1 : 2 });
    };
    walk(join(root, 'instructions', name), `instructions/${name}`);
    return out;
  };
}
```

Then in `bin/cli.js` replace usage:

```js
const listModules = makeListModules(pkgRoot);
const { coreModules, bundles } = resolveSections({ sections: manifest.sections || [], listModules });
```

- [ ] **Step 7: Run to verify it passes**

Run: `node --test test/list-modules.test.js test/sections.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add bin/cli.js src/sections.js test/sections.test.js test/list-modules.test.js
git commit -m "$(printf '%s' '🤖 refactor(generator): tree-aware listModules + descriptor resolveSections

Usage: model=claude-opus-4-8[1m]
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 4: thread `{text, demote}` through `build.js` + wire `bin/cli.js`

**Files:**
- Modify: `src/build.js` (`buildOutputs` modules/bundles param shape)
- Modify: `bin/cli.js` (read paths into `{text, demote}`)
- Test: `test/build.test.js`

- [ ] **Step 1: Update build tests to the new module shape**

In `test/build.test.js`, change every `modules: ['...']` / bundle `modules: ['...']` to `{ text, demote }` items. Add an assertion that demote is honored end-to-end:

```js
test('buildOutputs demotes core modules by their descriptor', () => {
  const out = buildOutputs({
    preamble: '# Root',
    modules: [{ text: '# G\n\nx', demote: 1 }, { text: '# #t T\n\ny', demote: 2 }],
    bundles: [],
    source: 's',
  });
  assert.match(out.coreContent, /^## G$/m);
  assert.match(out.coreContent, /^### #t T$/m);
});
```

(Keep the existing structural assertions — corePath, stub, bundle paths — unchanged; only the module item shape changes.)

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/build.test.js`
Expected: FAIL — `buildOutputs` passes module strings straight to `generate`; `{text,demote}` items are not demoted as expected (the `--full` concat path stringifies objects).

- [ ] **Step 3: Implement in `src/build.js`**

`buildOutputs` already forwards `modules` and `bundles[].modules` to `generate`. Two spots need the new shape:
- `full` layout concat: `const allModules = [...modules, ...bundles.flatMap((b) => b.modules)];` — still correct (items are now `{text,demote}`, `generate` handles them).
- lean: `generate({ preamble, modules: [...modules, ...indexModules], ... })` — the on-demand index module is a **string** (legacy, demote 1) which `generate` still accepts. No change needed beyond passing the descriptor arrays through.

So `build.js` needs **no structural change** if `modules`/`bundles[].modules` are already `{text,demote}` arrays — verify by running the test. If the `--full` path or index injection breaks, wrap the index string explicitly: `[...modules, ...indexModules.map((t) => ({ text: t, demote: 1 }))]`.

- [ ] **Step 4: Wire `bin/cli.js` to read descriptors into `{text, demote}`**

```js
const built = buildOutputs({
  preamble: read(manifest.preamble),
  modules: coreModules.map(({ path, demote }) => ({ text: read(path), demote })),
  bundles: bundles.map((b) => ({
    name: b.name,
    title: b.title,
    when: b.when,
    modules: b.modules.map(({ path, demote }) => ({ text: read(path), demote })),
  })),
  source: manifest.source,
  commit, date, layout, placement, output: manifest.output, out,
});
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test test/build.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/build.js bin/cli.js test/build.test.js
git commit -m "$(printf '%s' '🤖 refactor(generator): thread per-module demote through build

Usage: model=claude-opus-4-8[1m]
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

> At this point the generator supports the new model but the tree is unchanged (still one file per section, each a single module with demote derived as a leaf: `instructions/core/ai.md` etc. would now be read as... — NOTE: until the tree is split, `listModules('core')` walks `instructions/core/` which holds `ai.md` etc. as files in a leaf dir, so each is demoted by 2, not 1 — which WOULD change output). **Therefore Tasks 1–4 must NOT be run against the old tree in isolation.** Do not regenerate or land a release between Task 4 and Task 8; the atomicity rule (spec §1 / F1) means the resolver change and the tree move land together. Tests above use synthetic inputs, so the suite stays green; `node bin/cli.js` against the real old tree is expected to differ until Task 8 and must not be committed as output.

---

## Task 5: lowercase-leading tag-filename lint

**Files:**
- Modify: `src/bundles.js` (extend `ownershipCoverage` or add `tagFilenameLint`)
- Test: `test/bundles.test.js` (create if absent) or `test/list-modules.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/restructure-lint.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagFilenameLint } from '../src/bundles.js';

test('tagFilenameLint flags non-lowercase-leading tag files', () => {
  assert.deepEqual(tagFilenameLint(['instructions/core/swe/swe-reuse.md', 'instructions/core/swe/_intro.md']), []);
  assert.deepEqual(
    tagFilenameLint(['instructions/core/swe/Swe-Bad.md', 'instructions/core/swe/2-foo.md']),
    ['instructions/core/swe/Swe-Bad.md', 'instructions/core/swe/2-foo.md'],
  );
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/restructure-lint.test.js`
Expected: FAIL — `tagFilenameLint` not exported.

- [ ] **Step 3: Implement in `src/bundles.js`**

```js
/** Tag filenames must be lowercase-leading (so filename-sort == tag-sort). _intro.md is exempt. */
export function tagFilenameLint(paths) {
  return paths
    .map((p) => ({ p, base: p.split('/').pop() }))
    .filter(({ base }) => base !== '_intro.md' && !/^[a-z]/.test(base))
    .map(({ p }) => p);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/restructure-lint.test.js`
Expected: PASS.

- [ ] **Step 5: Wire it into the coverage test that CI runs** (the existing ownership test). In the test that calls `ownershipCoverage` over the real tree, also assert `tagFilenameLint(allTagPaths)` is empty. (Add after Task 8 when the tree exists; for now the unit test suffices.)

- [ ] **Step 6: Commit**

```bash
git add src/bundles.js test/restructure-lint.test.js
git commit -m "$(printf '%s' '🤖 feat(generator): lowercase-leading tag-filename lint

Usage: model=claude-opus-4-8[1m]
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 6: reorder pre-step (rules alphabetical within each file)

**Files:**
- Create: `devtools/restructure/reorder.mjs`
- Captures: run it, review the `--stdout` diff (pure reordering), commit the reordered sources.

- [ ] **Step 1: Snapshot the current emitted output (baseline)**

```bash
node bin/cli.js --full > /tmp/agents.pre-full.md
node bin/cli.js --stdout > /tmp/agents.pre-core.md
```

- [ ] **Step 2: Write `devtools/restructure/reorder.mjs`**

```js
/** One-time: sort the `## #tag` sections alphabetically within each multi-rule file. */
import { readFileSync, writeFileSync } from 'node:fs';

const FILES = process.argv.slice(2);
const isHeading = (l) => /^## #/.test(l);
const tagOf = (l) => l.match(/^## #(\S+)/)[1];

for (const file of FILES) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const first = lines.findIndex(isHeading);
  if (first === -1) continue; // no rules (shouldn't happen)
  const head = lines.slice(0, first);            // file h1 + intro prose (unchanged)
  const sections = [];
  let cur = null;
  for (const l of lines.slice(first)) {
    if (isHeading(l)) { cur = { tag: tagOf(l), body: [l] }; sections.push(cur); }
    else cur.body.push(l);
  }
  // each section: strip trailing blank lines, we re-join with exactly one blank line
  const norm = sections
    .map((s) => ({ tag: s.tag, text: s.body.join('\n').replace(/\n+$/, '') }))
    .sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  const out = [...head.join('\n').replace(/\n+$/, ''), ''].join('\n').replace(/\n+$/, '')
    + '\n\n' + norm.map((s) => s.text).join('\n\n') + '\n';
  writeFileSync(file, out);
}
console.log(`reordered ${FILES.length} files`);
```

- [ ] **Step 3: Run it on the non-alphabetical files**

```bash
node devtools/restructure/reorder.mjs \
  instructions/core/ai.md instructions/core/git.md instructions/core/swe.md \
  instructions/frontend/front.md instructions/frontend/ui-guidelines.md
```

- [ ] **Step 4: Verify it is content-preserving (reorder only)**

```bash
node --test            # full suite still green (ownership unaffected by order)
node bin/cli.js --stdout > /tmp/agents.post-core.md
diff <(sort /tmp/agents.pre-core.md) <(sort /tmp/agents.post-core.md)
```
Expected: the line-sorted diff is **empty** (same lines, only order changed). The unsorted `--stdout` diff will show the reordering — review it to confirm only `## #tag` blocks moved.

- [ ] **Step 5: Commit the reordered sources**

```bash
git add instructions/
git commit -m "$(printf '%s' '🤖 refactor(instructions): sort rules alphabetically within each file

Pre-step for the one-file-per-tag split: content-preserving reorder so the
alphabetical resolver reproduces the sources post-split. Line-sorted diff of
node bin/cli.js --stdout is empty (only rule order changed).

Usage: model=claude-opus-4-8[1m]
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 7: whitespace normalization pre-step

**Files:**
- Extend: `devtools/restructure/reorder.mjs` already emits exactly one blank line between sections and trims section-trailing blanks. Apply the same normalization to the two already-alphabetical files (`code.md`, `backend.md`) and `main.md`/`_intro` sources so every section, extracted and `trim()`-ed in isolation, equals its joined slice (spec §1.2 F4).

- [ ] **Step 1: Run the normalizer over the remaining files**

```bash
node devtools/restructure/reorder.mjs instructions/core/code.md instructions/backend/backend.md instructions/authoring/instruction-review.md
```
(For files already alphabetical this is a pure whitespace normalization.)

- [ ] **Step 2: Verify strict equality of emitted output before/after normalization**

```bash
node bin/cli.js --stdout > /tmp/agents.norm-core.md
node bin/cli.js --full > /tmp/agents.norm-full.md
# Compare to the reordered baseline (Task 6 post): differences must be whitespace-only.
git diff --stat
node --test
```
Expected: any change is whitespace-only; suite green. If `node bin/cli.js --stdout` differs from the Task-6 output in non-whitespace, STOP — the normalizer is wrong.

- [ ] **Step 3: Commit**

```bash
git add instructions/ devtools/restructure/reorder.mjs
git commit -m "$(printf '%s' '🤖 refactor(instructions): normalize section whitespace

Single blank line between sections, no section-edge blank lines, so each
section trim()-ed in isolation equals its slice in the joined output -- the
precondition for a zero-diff split.

Usage: model=claude-opus-4-8[1m]
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 8: migration — split into the tree, gated on empty diff

**Files:**
- Create: `devtools/restructure/migrate-tree.mjs`
- Create: `devtools/restructure/gate.mjs`
- Move: `instructions/<section>/<file>.md` → `instructions/<section>/<group>/{_intro.md,<tag>.md}`
- Modify: nothing in `src/` (Tasks 1–4 already support the tree)

- [ ] **Step 1: Capture the prepared baseline (post Tasks 6–7)**

```bash
node bin/cli.js --stdout > /tmp/gate.pre-core.md
node bin/cli.js --full   > /tmp/gate.pre-full.md
node bin/cli.js          # writes .agentsmith/AGENTS.md + bundles; snapshot them
cp -r .agentsmith/agents /tmp/gate.pre-bundles
```

- [ ] **Step 2: Write `devtools/restructure/migrate-tree.mjs`**

```js
/** One-time: split each multi-rule file into <section>/<group>/{_intro.md,<tag>.md}. */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

// [sourceFile, groupDir]  (groupDir = source basename; leaf sections keep their own dir)
const MAP = [
  ['instructions/core/ai.md', 'instructions/core/ai'],
  ['instructions/core/code.md', 'instructions/core/code'],
  ['instructions/core/git.md', 'instructions/core/git'],
  ['instructions/core/swe.md', 'instructions/core/swe'],
  ['instructions/frontend/front.md', 'instructions/frontend/front'],
  ['instructions/frontend/ui-guidelines.md', 'instructions/frontend/ui-guidelines'],
  ['instructions/backend/backend.md', 'instructions/backend'],
  ['instructions/authoring/instruction-review.md', 'instructions/authoring'],
];

const isHeading = (l) => /^## #/.test(l);
const tagOf = (l) => l.match(/^## #(\S+)/)[1];

for (const [src, groupDir] of MAP) {
  const lines = readFileSync(src, 'utf8').split('\n');
  const first = lines.findIndex(isHeading);
  const head = lines.slice(0, first).join('\n').replace(/\n+$/, '');
  mkdirSync(groupDir, { recursive: true });
  // _intro.md = the file's leading content (h1 + prose), verbatim
  writeFileSync(join(groupDir, '_intro.md'), head + '\n');
  // each section -> <tag>.md, heading promoted ## -> #
  let cur = null;
  const flush = () => {
    if (!cur) return;
    const body = cur.body.join('\n').replace(/\n+$/, '');
    const promoted = body.replace(/^## #/, '# #');
    writeFileSync(join(groupDir, `${cur.tag}.md`), promoted + '\n');
  };
  for (const l of lines.slice(first)) {
    if (isHeading(l)) { flush(); cur = { tag: tagOf(l), body: [l] }; }
    else cur.body.push(l);
  }
  flush();
  rmSync(src); // remove the old multi-rule file
}
console.log('tree migration complete');
```

- [ ] **Step 3: Run the migration**

```bash
node devtools/restructure/migrate-tree.mjs
```

- [ ] **Step 4: Write `devtools/restructure/gate.mjs` (strict empty-diff)**

```js
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const run = (args) => execFileSync('node', ['bin/cli.js', ...args], { encoding: 'utf8' });
const read = (p) => readFileSync(p, 'utf8');

const checks = [
  ['--stdout core', run(['--stdout']), read('/tmp/gate.pre-core.md')],
  ['--full', run(['--full']), read('/tmp/gate.pre-full.md')],
];
// regenerate bundles, compare each
run([]);
for (const f of readdirSync('/tmp/gate.pre-bundles')) {
  checks.push([`bundle ${f}`, read(join('.agentsmith/agents', f)), read(join('/tmp/gate.pre-bundles', f))]);
}

let ok = true;
for (const [name, post, pre] of checks) {
  if (post !== pre) { ok = false; console.error(`DIFF in ${name}`); }
}
console.log(ok ? 'GATE PASS: empty diff' : 'GATE FAIL');
process.exit(ok ? 0 : 1);
```

- [ ] **Step 5: Run the gate + lints + suite**

```bash
node devtools/restructure/gate.mjs   # must print GATE PASS
node --test                          # must stay green (ownership + filename lint)
```
Expected: `GATE PASS: empty diff`; suite green. If the gate fails, inspect the diff, fix `migrate-tree.mjs` or the demote wiring, re-run (the migration reads the still-present prepared sources — restore from git if needed: `git checkout instructions/` then re-run).

- [ ] **Step 6: Add the filename lint assertion to the ownership/coverage test**

In the test that runs `ownershipCoverage` over the real tree, gather every tag file path via `makeListModules(pkgRoot)` across all sections and assert `tagFilenameLint(paths)` is `[]`.

- [ ] **Step 7: Commit the restructure**

```bash
git add instructions/ devtools/restructure/ test/
git commit -m "$(printf '%s' '🤖 refactor(instructions): split into one file per tag

Each #tag is now <section>/<group>/<tag>.md under a group _intro.md; the
generator resolver is tree-aware and demotes _intro by 1, tag files by 2,
preserving each source h1 verbatim. node bin/cli.js --stdout/--full and every
bundle are byte-identical to the pre-split prepared tree (gate.mjs: GATE PASS).

Usage: model=claude-opus-4-8[1m]
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 9: extend the export test to cover `devtools/restructure/`

**Files:**
- Modify: `test/triage-export.test.mjs`

- [ ] **Step 1: Add an assertion**

In `test/triage-export.test.mjs`, alongside the `devtools/triage-ui/` checks, assert `planToolInstall` produces no `devtools/restructure/` destination and `npm pack --dry-run --json` lists no `devtools/restructure/` path.

- [ ] **Step 2: Run**

Run: `node --test test/triage-export.test.mjs`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add test/triage-export.test.mjs
git commit -m "$(printf '%s' '🤖 test(export): assert devtools/restructure is never shipped

Usage: model=claude-opus-4-8[1m]
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Phase 1 done-check

- [ ] `node devtools/restructure/gate.mjs` → `GATE PASS: empty diff`
- [ ] `node --test` → all green (generate, sections, list-modules, build, restructure-lint, ownership+filename lint, triage-* unchanged)
- [ ] `node bin/cli.js` clean; `.agentsmith/AGENTS.md` + bundles unchanged vs pre-split
- [ ] old multi-rule files removed; `instructions/` is one file per tag + `_intro.md` per group
- [ ] `git status` clean

Phase 1 ships independently. The interim apply path (spec §1.4) keeps `/instruction-apply` working (whole-file replace) until Phase 2.
