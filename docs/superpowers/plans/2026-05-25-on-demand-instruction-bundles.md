# On-demand Instruction Bundles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the generated instructions into a lean always-loaded core plus runtime-loaded domain bundles, with a full-monolith fallback behind a flag.

**Architecture:** Two new pure modules. `src/bundles.js` builds the on-demand index and detects dangling `#tag` references. `src/build.js` (`buildOutputs`) assembles every output file as in-memory strings from the manifest data, choosing layout (lean/full) and placement (nested/root). `bin/cli.js` parses flags and performs the only side effects: `mkdir`, file writes, stdout, and a write-if-absent root stub. `src/generate.js` is reused unchanged for the core doc, each bundle file, and the full monolith.

**Tech Stack:** Node.js ESM, `node:test`, `node:fs`, `node:path`. No third-party deps.

---

## Reference: design spec

`docs/superpowers/specs/2026-05-25-on-demand-instruction-bundles-design.md`

## Behavior summary (defaults)

- `agentsmith` (no flags) = lean + nested: writes `.agentsmith/AGENTS.md` (core + index), `.agentsmith/agents/<name>.md` per bundle, and a root `./AGENTS.md` stub only if root is absent.
- `--full` / `--inline` = monolith core (all modules + every bundle's modules, manifest order); no index, no bundle files.
- `--root` = write core to `./AGENTS.md` instead of `.agentsmith/`.
- `--stdout` = print core to stdout, no disk writes.
- `--out <path>` = override core path, takes precedence over placement.

---

### Task 1: `onDemandIndex()` helper

**Files:**
- Create: `src/bundles.js`
- Test: `test/bundles.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onDemandIndex } from '../src/bundles.js';

test('onDemandIndex renders an h1, the tag, a MUST directive, and one bullet per entry', () => {
  const md = onDemandIndex([
    { when: 'Front-end or UI work', href: 'agents/frontend.md' },
  ]);

  assert.match(md, /^# On-demand instructions$/m, 'has an h1 so demotion lands it at h2');
  assert.match(md, /^## #on-demand /m, 'carries the #on-demand tag');
  assert.match(md, /\bMUST\b/, 'states the directive imperatively');
  assert.match(md, /- Front-end or UI work -> `agents\/frontend\.md`/, 'pairs when with href');
});

test('onDemandIndex renders one bullet per entry', () => {
  const md = onDemandIndex([
    { when: 'A work', href: 'agents/a.md' },
    { when: 'B work', href: 'agents/b.md' },
  ]);
  const bullets = md.split('\n').filter((l) => l.startsWith('- '));
  assert.equal(bullets.length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/bundles.test.js`
Expected: FAIL — `Cannot find module '../src/bundles.js'` / `onDemandIndex is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/bundles.js`:

```javascript
/**
 * Build the on-demand index block listed in a lean core.
 *
 * Authored at h1 + h2 so generate()'s heading demotion lands it at h2 + h3,
 * consistent with the demoted module sections around it.
 *
 * @param {{ when: string, href: string }[]} entries
 * @returns {string} Markdown for the index section (no trailing newline).
 */
export function onDemandIndex(entries) {
  return [
    '# On-demand instructions',
    '',
    '## #on-demand Load when relevant',
    '',
    'You **MUST** read the matching file in full before starting work in its area.',
    '',
    ...entries.map((e) => `- ${e.when} -> \`${e.href}\``),
  ].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/bundles.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/bundles.js test/bundles.test.js
git commit -m "feat: add onDemandIndex helper for lean instruction core"
```

---

### Task 2: `danglingTags()` helper

**Files:**
- Modify: `src/bundles.js`
- Test: `test/bundles.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/bundles.test.js`:

```javascript
import { danglingTags } from '../src/bundles.js';

test('danglingTags reports a referenced tag that is defined nowhere', () => {
  const result = danglingTags({
    coreText: '## #swe-done Done\n\nSee #swe-missing for details.',
    bundleTexts: [],
  });
  assert.deepEqual(result, ['swe-missing']);
});

test('danglingTags resolves a tag defined in a bundle', () => {
  const result = danglingTags({
    coreText: 'Follow #front-a11y when building UI.',
    bundleTexts: ['## #front-a11y Accessibility\n\nTarget WCAG.'],
  });
  assert.deepEqual(result, []);
});

test('danglingTags ignores tokens inside fenced code blocks', () => {
  const result = danglingTags({
    coreText: '## #real Tag\n\n```\n#fake-tag should be ignored\n```',
    bundleTexts: [],
  });
  assert.deepEqual(result, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/bundles.test.js`
Expected: FAIL — `danglingTags is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/bundles.js`:

```javascript
/**
 * Find #tag references that resolve to no heading definition across the union
 * of core and bundle texts. Definitions are `#{1,6} #tag` heading lines;
 * references are `#tag` tokens outside fenced code. Warn-only signal.
 *
 * @param {{ coreText: string, bundleTexts?: string[] }} input
 * @returns {string[]} Sorted unique tag names with no definition.
 */
export function danglingTags({ coreText, bundleTexts = [] }) {
  const defined = new Set();
  const referenced = new Set();

  for (const text of [coreText, ...bundleTexts]) {
    let inFence = false;
    for (const line of String(text).split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;

      const def = line.match(/^#{1,6}\s+#([a-z][a-z0-9-]+)\b/i);
      if (def) defined.add(def[1].toLowerCase());

      for (const m of line.matchAll(/#([a-z][a-z0-9-]+)\b/gi)) {
        referenced.add(m[1].toLowerCase());
      }
    }
  }

  return [...referenced].filter((t) => !defined.has(t)).sort();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/bundles.test.js`
Expected: PASS (5 tests total in this file).

- [ ] **Step 5: Commit**

```bash
git add src/bundles.js test/bundles.test.js
git commit -m "feat: add danglingTags cross-reference check"
```

---

### Task 3: `buildOutputs()` pure builder

**Files:**
- Create: `src/build.js`
- Test: `test/build.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/build.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOutputs } from '../src/build.js';
import { generate } from '../src/generate.js';

const base = {
  preamble: '# Agent instructions\n\nIntro.',
  modules: ['# Core\n\n## #core-x X'],
  bundles: [
    { name: 'frontend', title: 'Front-end instructions', when: 'Front-end or UI work',
      modules: ['# Front\n\n## #front-y Y'] },
  ],
  source: 's',
};

test('lean + nested: core goes under .agentsmith, bundle path and href resolve', () => {
  const out = buildOutputs({ ...base, layout: 'lean', placement: 'nested' });

  assert.equal(out.corePath, '.agentsmith/AGENTS.md');
  assert.equal(out.bundles.length, 1);
  assert.equal(out.bundles[0].path, '.agentsmith/agents/frontend.md');
  assert.match(out.coreContent, /agents\/frontend\.md/, 'href is relative to .agentsmith');
  assert.doesNotMatch(out.coreContent, /agentsmith\/agents/, 'href is not doubled under nesting');
  assert.match(out.coreContent, /#core-x/, 'core module is inlined');
  assert.doesNotMatch(out.coreContent, /#front-y/, 'bundle module is NOT inlined in lean core');
});

test('lean + root: core at AGENTS.md, href points into .agentsmith', () => {
  const out = buildOutputs({ ...base, layout: 'lean', placement: 'root', output: 'AGENTS.md' });

  assert.equal(out.corePath, 'AGENTS.md');
  assert.match(out.coreContent, /`\.agentsmith\/agents\/frontend\.md`/, 'href is root-relative');
});

test('full: monolith inlines every module, no bundle files, no index', () => {
  const out = buildOutputs({ ...base, layout: 'full', placement: 'root', output: 'AGENTS.md' });

  assert.equal(out.bundles.length, 0);
  assert.match(out.coreContent, /#core-x/);
  assert.match(out.coreContent, /#front-y/, 'bundle module inlined in full');
  assert.doesNotMatch(out.coreContent, /#on-demand/, 'no on-demand index in full');
});

test('full + root reproduces a plain generate() over all modules in order', () => {
  const out = buildOutputs({ ...base, layout: 'full', placement: 'root', output: 'AGENTS.md' });
  const expected = generate({
    preamble: base.preamble,
    modules: [...base.modules, ...base.bundles.flatMap((b) => b.modules)],
    source: base.source,
  });
  assert.equal(out.coreContent, expected);
});

test('bundle file has a single h1 from its title and demoted member headings', () => {
  const out = buildOutputs({ ...base, layout: 'lean', placement: 'nested' });
  const bundle = out.bundles[0].content;

  const h1s = bundle.split('\n').filter((l) => /^# /.test(l));
  assert.equal(h1s.length, 1, 'exactly one h1');
  assert.match(bundle, /^# Front-end instructions$/m, 'h1 is the bundle title');
  assert.match(bundle, /^## Front$/m, 'member h1 demoted to h2');
});

test('stub is planned when nested, omitted when root', () => {
  const nested = buildOutputs({ ...base, layout: 'lean', placement: 'nested' });
  assert.equal(nested.stub.path, 'AGENTS.md');
  assert.match(nested.stub.content, /\.agentsmith\/AGENTS\.md/);

  const root = buildOutputs({ ...base, layout: 'lean', placement: 'root', output: 'AGENTS.md' });
  assert.equal(root.stub, null);
});

test('dangling tag references are surfaced', () => {
  const out = buildOutputs({
    ...base,
    modules: ['# Core\n\n## #core-x X\n\nSee #core-ghost.'],
    layout: 'lean',
    placement: 'nested',
  });
  assert.ok(out.dangling.includes('core-ghost'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/build.test.js`
Expected: FAIL — `Cannot find module '../src/build.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/build.js`:

```javascript
import { posix as ppath } from 'node:path';
import { generate } from './generate.js';
import { onDemandIndex, danglingTags } from './bundles.js';

const BUNDLE_DIR = '.agentsmith/agents';

const STUB = [
  '<!-- Consumer-owned. agentsmith generates .agentsmith/AGENTS.md; reference or extend it here. -->',
  '',
  'See `.agentsmith/AGENTS.md` for generated agent instructions.',
  '',
].join('\n');

/**
 * Assemble every output file as in-memory strings. Pure: no disk access.
 *
 * @param {object}   opts
 * @param {string}   opts.preamble
 * @param {string[]} opts.modules                 Core module CONTENTS (already read).
 * @param {{name,title,when,modules:string[]}[]} [opts.bundles]  Bundle defs; modules are CONTENTS.
 * @param {string}   opts.source
 * @param {string}   [opts.commit]
 * @param {string}   [opts.date]
 * @param {'lean'|'full'} [opts.layout='lean']
 * @param {'nested'|'root'} [opts.placement='nested']
 * @param {string}   [opts.output='AGENTS.md']    Core filename when placement is root.
 * @param {string}   [opts.out]                   Explicit core path override.
 * @returns {{ corePath, coreContent, bundles: {path,content}[], stub: {path,content}|null, dangling: string[] }}
 */
export function buildOutputs({
  preamble,
  modules = [],
  bundles = [],
  source,
  commit,
  date,
  layout = 'lean',
  placement = 'nested',
  output = 'AGENTS.md',
  out,
}) {
  const corePath = out || (placement === 'nested' ? '.agentsmith/AGENTS.md' : output);
  const coreDir = ppath.dirname(corePath.split(/[\\/]/).join('/')) || '.';
  const hrefFor = (name) => ppath.relative(coreDir, `${BUNDLE_DIR}/${name}.md`);

  let coreContent;
  let bundleFiles = [];

  if (layout === 'full') {
    const allModules = [...modules, ...bundles.flatMap((b) => b.modules)];
    coreContent = generate({ preamble, modules: allModules, source, commit, date });
  } else {
    const index = onDemandIndex(
      bundles.map((b) => ({ when: b.when, href: hrefFor(b.name) })),
    );
    coreContent = generate({ preamble, modules: [...modules, index], source, commit, date });
    bundleFiles = bundles.map((b) => ({
      path: `${BUNDLE_DIR}/${b.name}.md`,
      content: generate({
        preamble: `# ${b.title || b.name}`,
        modules: b.modules,
        source,
        commit,
        date,
      }),
    }));
  }

  const dangling = danglingTags({
    coreText: coreContent,
    bundleTexts: bundleFiles.map((f) => f.content),
  });

  const stub = placement === 'nested' && !out ? { path: 'AGENTS.md', content: STUB } : null;

  return { corePath, coreContent, bundles: bundleFiles, stub, dangling };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/build.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/build.js test/build.test.js
git commit -m "feat: add buildOutputs to assemble lean and full layouts"
```

---

### Task 4: Restructure `manifest.json`

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Replace the manifest contents**

Overwrite `manifest.json` with:

```json
{
  "source": "https://github.com/viniciussegura/agentsmith",
  "preamble": "instructions/main.md",
  "modules": [
    "instructions/ai.md",
    "instructions/code.md",
    "instructions/git.md",
    "instructions/swe.md"
  ],
  "bundles": [
    {
      "name": "frontend",
      "title": "Front-end instructions",
      "when": "Front-end or UI work",
      "modules": [
        "instructions/front.md",
        "instructions/ui-guidelines.md"
      ]
    }
  ],
  "output": "AGENTS.md"
}
```

- [ ] **Step 2: Verify it parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "refactor: split front-end modules into a bundle in the manifest"
```

---

### Task 5: Wire `bin/cli.js` to flags and `buildOutputs`

**Files:**
- Modify: `bin/cli.js`

- [ ] **Step 1: Rewrite the orchestration**

Replace the body of `bin/cli.js` below the `sourceRevision()` function (keep the imports block at the top updated and keep `sourceRevision` as-is). Final file:

```javascript
#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { generate } from '../src/generate.js';
import { buildOutputs } from '../src/build.js';

// Resolve sources relative to the package, not the consumer's cwd.
const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(pkgRoot, 'manifest.json'), 'utf8'));
const read = (rel) => readFileSync(join(pkgRoot, rel), 'utf8');

// Stamp the header with the source revision. Describes the instruction repo
// (pkgRoot), not the consumer's project. Silently skipped outside a git repo.
function sourceRevision() {
  const git = (args) => execFileSync('git', args, { cwd: pkgRoot }).toString().trim();
  try {
    const commit = git(['rev-parse', '--short', 'HEAD']);
    const date = git(['log', '-1', '--format=%cd', '--date=short']);
    const dirty = git(['status', '--porcelain']) !== '';
    return { commit: dirty ? `${commit}-dirty` : commit, date };
  } catch {
    return {};
  }
}

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const layout = has('--full') || has('--inline') ? 'full' : 'lean';
const placement = has('--root') ? 'root' : 'nested';
const outIdx = args.indexOf('--out');
const out = outIdx !== -1 ? args[outIdx + 1] : undefined;

const { commit, date } = sourceRevision();
const built = buildOutputs({
  preamble: read(manifest.preamble),
  modules: manifest.modules.map(read),
  bundles: (manifest.bundles || []).map((b) => ({
    name: b.name,
    title: b.title,
    when: b.when,
    modules: b.modules.map(read),
  })),
  source: manifest.source,
  commit,
  date,
  layout,
  placement,
  output: manifest.output,
  out,
});

if (built.dangling.length) {
  process.stderr.write(
    `agentsmith: warning -- unresolved #tag references: ${built.dangling.join(', ')}\n`,
  );
}

if (has('--stdout')) {
  process.stdout.write(built.coreContent);
} else {
  const writeOut = (rel, content) => {
    const dest = resolve(process.cwd(), rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
    process.stderr.write(`agentsmith: wrote ${dest}\n`);
  };

  writeOut(built.corePath, built.coreContent);
  for (const bundle of built.bundles) writeOut(bundle.path, bundle.content);

  if (built.stub) {
    const stubDest = resolve(process.cwd(), built.stub.path);
    if (existsSync(stubDest)) {
      process.stderr.write(`agentsmith: kept existing ${stubDest}\n`);
    } else {
      writeOut(built.stub.path, built.stub.content);
    }
  }
}
```

Note: `generate` import is retained only if still referenced; in this version it is not used directly by cli, so remove the line `import { generate } from '../src/generate.js';` if your linter flags an unused import. Leave it if no linter is configured.

- [ ] **Step 2: Smoke-test default (lean + nested) into a scratch dir**

Run (bash):
```bash
mkdir -p /tmp/asmoke && (cd /tmp/asmoke && node "$OLDPWD/bin/cli.js") && find /tmp/asmoke -type f | sort
```
Run (PowerShell):
```powershell
$d = Join-Path $env:TEMP 'asmoke'; New-Item -ItemType Directory -Force $d > $null; Push-Location $d; node (Join-Path $PSScriptRoot '..\bin\cli.js'); Pop-Location; Get-ChildItem -Recurse -File $d | ForEach-Object FullName
```
Expected: `.agentsmith/AGENTS.md`, `.agentsmith/agents/frontend.md`, and `AGENTS.md` (the stub) exist.

- [ ] **Step 3: Verify `--full --root` and single-h1 invariants**

Run: `node bin/cli.js --full --root --stdout` and confirm exactly one line begins with `# ` and bundle content (`#front-` and `#ui-` tags) is present.

- [ ] **Step 4: Commit**

```bash
git add bin/cli.js
git commit -m "feat: add --lean/--full and --nested/--root layout flags to the cli"
```

---

### Task 6: Integration test for the cli file tree and stub preservation

**Files:**
- Create: `test/cli.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/cli.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
```

- [ ] **Step 2: Run test to verify it fails or passes correctly**

Run: `node --test test/cli.test.js`
Expected: PASS (cli already implemented in Task 5). If it FAILS, fix `bin/cli.js`, not the test.

Note: this is an integration test exercising already-built behavior; it validates the stub write-if-absent rule, which has no pure-unit equivalent.

- [ ] **Step 3: Commit**

```bash
git add test/cli.test.js
git commit -m "test: cover cli file tree and root-stub preservation"
```

---

### Task 7: Ignore `.agentsmith/`, regenerate, full suite

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add the ignore rule**

Append to `.gitignore` (do not duplicate if present):

```
.agentsmith/
```

- [ ] **Step 2: Run the full test suite**

Run: `node --test`
Expected: all tests pass across `generate.test.js`, `bundles.test.js`, `build.test.js`, `cli.test.js`.

- [ ] **Step 3: Regenerate and confirm the tree is clean**

Run: `node bin/cli.js` then `git status --porcelain`
Expected: no tracked `.agentsmith/` entries appear (only the gitignored dir, untracked-but-ignored). Root `AGENTS.md` is gitignored already.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore generated .agentsmith output"
```

---

## Self-review

**Spec coverage:**
- Lean/full layout -> Tasks 3, 5; full equivalence guarded in Task 3.
- Nested/root placement + href resolution -> Task 3 (`hrefFor`), tested both placements.
- MUST wording + h1/h2 authoring -> Task 1.
- Bundle single-h1 via title -> Task 3 test.
- Root stub write-if-absent -> Task 5 logic, Task 6 integration test.
- `--stdout` no disk writes -> Task 5.
- Dangling cross-ref warning -> Tasks 2, 3 (propagation), 5 (stderr).
- Manifest schema -> Task 4.
- gitignore `.agentsmith/` -> Task 7.

**Placeholder scan:** none — every code step shows full code.

**Type/name consistency:** `buildOutputs` return shape (`corePath`, `coreContent`, `bundles[].path/.content`, `stub.path/.content`, `dangling`) is used identically in Task 3 tests and Task 5 cli. `onDemandIndex(entries:{when,href})` and `danglingTags({coreText,bundleTexts})` signatures match across Tasks 1-3 and 5.

**Known limitation (accepted):** `danglingTags` token regex can flag a CSS hex like `#fff` outside code as a reference; acceptable for a warn-only signal, noted in spec Risks.
