# Records architecture Implementation Plan

Status: Implemented

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mutable design-decisions rationale log, a generated working-specs index, plan-pruning, and authoring-time conformance — wiring four existing rules and migrating stray spec/plan files.

**Architecture:** New instruction rule `#swe-design-decisions` (a present-truth sibling of the reference spec) plus edits to `#ai-plan`, `#swe-done`, `#ai-session-hygiene`, `#swe-reference-spec`. A new `src/specindex.js` (pure parse/scan/render) driven by `bin/spec-index.js` generates the committed `docs/working-specs/INDEX.md`, guarded by a drift test. All behavior flows from sources; `AGENTS.md` is generated, never hand-edited.

**Tech Stack:** Node ESM, `node --test`, the agentsmith generator (`bin/cli.js`, `src/`), Markdown instruction sources, YAML ownership map.

## Global Constraints

- Instruction prose: terse, normative, `#tag` cross-references in backticks; mirror existing rule files (h1 `# #tag Title`, short paragraphs/bullets). One rule = one file.
- Every new `#tag` forces exactly one `instructions/ownership.yaml` row; the coverage lint (`src/bundles.js`) fails CI on any orphan / duplicate / unresolved owner.
- Every `#tag` referenced in prose must resolve to a defined rule, or the generator emits a dangling-tag warning (gated by `test/instruction-integrity.test.mjs`).
- Never hand-edit `AGENTS.md` / `.agentsmith/AGENTS.md` — regenerate from sources. Both are gitignored and are **never committed**.
- `docs/working-specs/INDEX.md` **is** committed (human-browsable on the forge) and is guarded by a drift test.
- Node ESM, `"type": "module"`; tests run under `node --test`. Repo root in a test file: `join(fileURLToPath(import.meta.url), '..', '..')`.
- Work stays on branch `feat/records-architecture` (already checked out). Never commit to `main`.
- Present-truth vs gate distinction (from spec): a design decision file is mutable/self-replacing; `#swe-done` keeps **existing** decision files current but never requires authoring a new one (authoring stays a soft `#ai-session-hygiene` prompt).

---

### Task 1: New rule `#swe-design-decisions` + ownership row

**Files:**
- Create: `instructions/core/swe/swe-design-decisions.md`
- Modify: `instructions/ownership.yaml` (one row under the `# swe` block)
- Test (existing gate): `test/instruction-integrity.test.mjs`

**Interfaces:**
- Consumes existing tags (must resolve): `#swe-reference-spec`, `#ai-plan`, `#ai-instruction-review`, `#swe-docs-drift`, `#swe-done`, `#ai-session-hygiene`.
- Produces new tag `#swe-design-decisions`, owned by `swe`. Tasks 2 and 6 reference it.

- [ ] **Step 1: Write the rule file**

Create `instructions/core/swe/swe-design-decisions.md` with exactly:

```markdown
# #swe-design-decisions Design decisions

The design-decisions log records *why* the system is as it is now -- the standing rationale for choices that bind work beyond the unit that introduced them.
It lives under `docs/design-decisions/`, one file per decision (`<decision-slug>.md`), created lazily when the first cross-cutting decision is warranted, **never** preemptively.
Like the reference spec (#swe-reference-spec) and unlike working specs (#ai-plan), a decision file is **mutable and self-replacing**: no `Status:` line, no date in the name. Edit it in place when the decision changes; delete it when the decision is abandoned. Past rationale is preserved by the frozen working spec that introduced the change (#ai-plan) and by git -- the log never accretes superseded entries.
Scope by reach: a choice local to one unit stays in that unit's working spec; only a choice that binds other work, or that a future contributor would re-litigate, earns a decision file. A decision is always project scope (a committed repo file).
It is the WHY counterpart to the reference spec's WHAT/HOW; the relationship is many-to-many. Present-truth documents and working specs link **out** to a decision by slug; a decision need not enumerate its referrers -- to find what a decision affects, grep its slug.
Distinct from `docs/instruction-rules-decisions.md`, the regenerated audit output of the instruction-review application (#ai-instruction-review), which is not hand-authored rationale.
Kept current under #swe-docs-drift and gated by #swe-done, which checks that an existing decision file is not left stale when a change alters its rationale -- never that a new decision must be authored (authoring is a soft #ai-session-hygiene prompt).
```

- [ ] **Step 2: Add the ownership row**

In `instructions/ownership.yaml`, under the `# swe -- base lens` block, add immediately after the `swe-deep-modules: swe` line:

```yaml
  swe-design-decisions: swe
```

- [ ] **Step 3: Run the integrity gate**

Run: `node --test test/instruction-integrity.test.mjs`
Expected: PASS — both subtests green. Ownership: no `orphans` (the new row covers the new tag), no double-owned. Dangling-tag: clean (all six referenced tags already exist). If the ownership row were omitted, the ownership subtest fails with `orphans: swe-design-decisions`.

- [ ] **Step 4: Commit**

```bash
git add instructions/core/swe/swe-design-decisions.md instructions/ownership.yaml
git commit -m "feat(instructions): add #swe-design-decisions rule"
```

---

### Task 2: Wire the four existing rules

**Files:**
- Modify: `instructions/core/ai/ai-plan.md`
- Modify: `instructions/core/swe/swe-done.md`
- Modify: `instructions/core/ai/ai-session-hygiene.md`
- Modify: `instructions/core/swe/swe-reference-spec.md`
- Test (existing gate): `test/instruction-integrity.test.mjs`

**Interfaces:**
- Consumes `#swe-design-decisions` (created in Task 1) and existing `#ai-spec-review`, `#swe-reference-spec`, `#swe-entity`, `#swe-docs-drift`. All must resolve.
- Produces no new tags.

- [ ] **Step 1: Add the `#ai-plan` clauses**

In `instructions/core/ai/ai-plan.md`, append these three bullets at the end of the list (after the line `- Non-trivial changes start with a user-approved spec before a plan is written and executed.`):

```markdown
- A new working spec carries a short **Conformance** section stating it conforms to the current reference spec (#swe-reference-spec) and design decisions (#swe-design-decisions), or naming where and why it diverges and whether those present-truth docs must change. The statement's home is that named section, so author and reviewer both know where to look; it is enforced by the adversarial spec review (#ai-spec-review) -- a spec that silently contradicts present-truth without justification is a blocking finding. Any divergence's doc updates are applied at #swe-done.
- A plan reaching `Implemented` **may be pruned** -- an explicit exception to the append-only rule above, for plans only (deletion, not in-place mutation), justified because a plan is execution scaffolding with no residual present-truth; the spec, the shipped code, and git carry the result. The spec is **never** pruned.
- The set of working specs is indexed at generated `docs/working-specs/INDEX.md`, regenerated as mechanical upkeep under #swe-done; a drift test is the backstop, not the trigger.
```

- [ ] **Step 2: Amend `#swe-done` item 2**

In `instructions/core/swe/swe-done.md`, replace item 2 exactly:

Old:
```markdown
2. Documentation drift is resolved (#swe-docs-drift), including the reference spec when current behavior changed (#swe-reference-spec) and the entity model when the schema changed (#swe-entity).
```
New:
```markdown
2. Documentation drift is resolved (#swe-docs-drift), including the reference spec when current behavior changed (#swe-reference-spec), the entity model when the schema changed (#swe-entity), and the design-decisions log when this change altered an existing decision's rationale (#swe-design-decisions); the working-specs index (#ai-plan) is regenerated when a spec was added or its `Status:` changed.
```

- [ ] **Step 3: Amend `#ai-session-hygiene`**

In `instructions/core/ai/ai-session-hygiene.md`, replace the two body lines exactly:

Old:
```markdown
At the end of a unit of work, decide whether anything learned this session warrants persisting -- a reusable work standard or a new memory -- and state that decision (a chosen scope, or "nothing to persist").
The same #ai-persistence logic governs both: ask, then scope it session / project / user -- a standard meant to apply across projects persists at user scope, one specific to this project at project scope.
```
New:
```markdown
At the end of a unit of work, decide whether anything learned this session warrants persisting -- a reusable work standard, a new memory, or a cross-cutting design decision (#swe-design-decisions) -- and state that decision (a chosen scope, or "nothing to persist").
The same #ai-persistence logic governs standards and memories: ask, then scope it session / project / user -- a standard meant to apply across projects persists at user scope, one specific to this project at project scope.
A design decision is always project scope (a committed `docs/design-decisions/` file); the reach test (#swe-design-decisions) decides only whether it warrants a file, independent of that tier.
```

- [ ] **Step 4: Add the `#swe-reference-spec` cross-reference**

In `instructions/core/swe/swe-reference-spec.md`, insert a new line immediately after line 3 (the line ending `the single place to learn what the software does now.`):

```markdown
It records WHAT and HOW the system is; the *why* behind cross-cutting choices lives in the design-decisions log (#swe-design-decisions), its many-to-many WHY counterpart.
```

- [ ] **Step 5: Run the integrity gate and the generator**

Run: `node --test test/instruction-integrity.test.mjs`
Expected: PASS — dangling-tag subtest clean (all newly referenced tags resolve), ownership unchanged.
Run: `node bin/cli.js --stdout > /dev/null`
Expected: exit 0, no `warning --` lines on stderr.

- [ ] **Step 6: Commit**

```bash
git add instructions/core/ai/ai-plan.md instructions/core/swe/swe-done.md instructions/core/ai/ai-session-hygiene.md instructions/core/swe/swe-reference-spec.md
git commit -m "feat(instructions): wire design-decisions, conformance, plan-pruning, spec index into #ai-plan/#swe-done/#ai-session-hygiene/#swe-reference-spec"
```

---

### Task 3: Spec-index generator (pure functions + CLI + pure tests)

**Files:**
- Create: `src/specindex.js`
- Create: `bin/spec-index.js`
- Create: `test/spec-index.test.mjs`
- Modify: `package.json` (one script line)

**Interfaces:**
- Produces, from `src/specindex.js`:
  - `parseSpec(text: string) -> { title: string, status: string }`
  - `scanWorkingSpecs(dir: string) -> Array<{ date, slug, dir, title, status }>` (sorted date-desc, then slug-asc)
  - `renderIndex(units) -> string`
- `bin/spec-index.js` writes `docs/working-specs/INDEX.md`. Task 5 generates the committed file and adds the live drift test.

- [ ] **Step 1: Write the pure-function tests**

Create `test/spec-index.test.mjs` with exactly:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSpec, renderIndex } from '../src/specindex.js';

test('parseSpec extracts H1 title and first Status token', () => {
  assert.deepEqual(
    parseSpec('# Spec: Foo\n\nDate: 2026-01-01\nStatus: Implemented\n'),
    { title: 'Spec: Foo', status: 'Implemented' },
  );
  // bold Status with a long descriptive value -> first token only
  assert.deepEqual(
    parseSpec('# Bar\n\n**Status:** reviewed -- converged after 5 rounds\n'),
    { title: 'Bar', status: 'reviewed' },
  );
  // no heading / no status -> placeholders
  assert.deepEqual(parseSpec('no heading here'), { title: '(untitled)', status: '—' });
});

test('renderIndex sorts date-desc then slug-asc and links to spec.md', () => {
  const units = [
    { date: '2026-01-01', slug: 'a', dir: '2026-01-01-a', title: 'A', status: 'Implemented' },
    { date: '2026-02-01', slug: 'b', dir: '2026-02-01-b', title: 'B', status: 'Draft' },
  ];
  const out = renderIndex(units);
  assert.match(out, /^# Working specs index/);
  assert.ok(out.includes('do not hand-edit'));
  // caller pre-sorts; renderIndex preserves order. Verify the row format + link.
  assert.match(out, /\| 2026-01-01 \| \[A\]\(2026-01-01-a\/spec\.md\) \| Implemented \|/);
  assert.match(out, /\| 2026-02-01 \| \[B\]\(2026-02-01-b\/spec\.md\) \| Draft \|/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/spec-index.test.mjs`
Expected: FAIL — `Cannot find module '../src/specindex.js'`.

- [ ] **Step 3: Write `src/specindex.js`**

Create `src/specindex.js` with exactly:

```javascript
// Generates docs/working-specs/INDEX.md from the working-spec corpus (#ai-plan).
// Pure functions here; bin/spec-index.js drives them. A drift test
// (test/spec-index.test.mjs) keeps the committed INDEX.md from going stale.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const EMDASH = '—';

// Parse one spec.md -> { title, status }. title: first '# ' heading (marker
// stripped). status: first line matching /Status:/ (optionally **bold**),
// reduced to the first whitespace token of its value; EMDASH when absent.
export function parseSpec(text) {
  const lines = text.split(/\r?\n/);
  const titleLine = lines.find((l) => /^#\s+/.test(l));
  const title = titleLine ? titleLine.replace(/^#\s+/, '').trim() : '(untitled)';
  const statusLine = lines.find((l) => /^\*{0,2}Status:/i.test(l.trim()));
  let status = EMDASH;
  if (statusLine) {
    const value = statusLine.trim().replace(/^\*{0,2}Status:\*{0,2}\s*/i, '').trim();
    status = value.split(/\s+/)[0] || EMDASH;
  }
  return { title, status };
}

// Scan a working-specs directory: each child dir named YYYY-MM-DD-<slug> with a
// spec.md becomes a unit. Sorted date-desc, then slug-asc.
export function scanWorkingSpecs(dir) {
  const units = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const m = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(e.name);
    if (!m) continue;
    let title = '(no spec.md)';
    let status = EMDASH;
    try {
      ({ title, status } = parseSpec(readFileSync(join(dir, e.name, 'spec.md'), 'utf8')));
    } catch {
      // a unit dir without spec.md keeps the placeholders
    }
    units.push({ date: m[1], slug: m[2], dir: e.name, title, status });
  }
  units.sort((a, b) => (a.date === b.date ? a.slug.localeCompare(b.slug) : b.date.localeCompare(a.date)));
  return units;
}

// Render the committed INDEX.md from pre-sorted units.
export function renderIndex(units) {
  const header =
    '# Working specs index\n\n' +
    '<!-- Generated by `node bin/spec-index.js` -- do not hand-edit. -->\n\n' +
    '| Date | Unit | Status |\n|---|---|---|\n';
  const rows = units.map((u) => `| ${u.date} | [${u.title}](${u.dir}/spec.md) | ${u.status} |`);
  return header + rows.join('\n') + '\n';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/spec-index.test.mjs`
Expected: PASS — both tests green.

- [ ] **Step 5: Write `bin/spec-index.js`**

Create `bin/spec-index.js` with exactly:

```javascript
#!/usr/bin/env node
// Regenerate docs/working-specs/INDEX.md from the working-spec corpus.
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanWorkingSpecs, renderIndex } from '../src/specindex.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'docs', 'working-specs');
const dest = join(dir, 'INDEX.md');
writeFileSync(dest, renderIndex(scanWorkingSpecs(dir)));
process.stderr.write(`agentsmith: wrote ${dest}\n`);
```

- [ ] **Step 6: Add the npm script**

In `package.json`, in `"scripts"`, add after the `"build:plugin"` line:

```json
    "build:index": "node bin/spec-index.js",
```

(Ensure the preceding line keeps its trailing comma and JSON stays valid.)

- [ ] **Step 7: Commit**

```bash
git add src/specindex.js bin/spec-index.js test/spec-index.test.mjs package.json
git commit -m "feat(docs): spec-index generator (parse/scan/render) + bin + pure tests"
```

---

### Task 4: Migrate the three stray `docs/superpowers/` units into `docs/working-specs/`

**Files:**
- Move: `docs/superpowers/plans/2026-06-19-scorecard-derived-cells.md` -> `docs/working-specs/2026-06-19-scorecard-derived-cells/plan.md` (spec dir already exists)
- Move: `docs/superpowers/specs/2026-06-23-review-board-token-cost-design.md` -> `docs/working-specs/2026-06-23-review-board-token-cost/spec.md`
- Move: `docs/superpowers/plans/2026-06-23-review-board-token-cost.md` -> `docs/working-specs/2026-06-23-review-board-token-cost/plan.md`

**Interfaces:** consumes nothing; produces a complete working-specs corpus for Task 5's index. These two units already shipped (`Status: Implemented`).

- [ ] **Step 1: Move the scorecard plan**

```bash
git mv docs/superpowers/plans/2026-06-19-scorecard-derived-cells.md docs/working-specs/2026-06-19-scorecard-derived-cells/plan.md
```

- [ ] **Step 2: Create the review-board-token-cost unit dir and move both files**

```bash
mkdir -p docs/working-specs/2026-06-23-review-board-token-cost
git mv docs/superpowers/specs/2026-06-23-review-board-token-cost-design.md docs/working-specs/2026-06-23-review-board-token-cost/spec.md
git mv docs/superpowers/plans/2026-06-23-review-board-token-cost.md docs/working-specs/2026-06-23-review-board-token-cost/plan.md
```

- [ ] **Step 3: Normalize the moved spec's `Status:` to a bare token**

The moved `docs/working-specs/2026-06-23-review-board-token-cost/spec.md` currently has a verbose status line (`Status: Approved design (ready for implementation plan)`). Read its first ~4 lines; replace that status line with exactly:

```markdown
Status: Implemented
```

(The unit shipped at commit `fbc25a3`.) Leave the scorecard files' existing `Status:` lines unchanged — `parseSpec` already reduces them to a first token.

- [ ] **Step 4: Verify the move is clean**

Run: `git status --short`
Expected: three renames (`R`) into `docs/working-specs/...`, plus the one-line status edit. No stray files left under `docs/superpowers/specs/` or `docs/superpowers/plans/` for these slugs.

- [ ] **Step 5: Commit**

```bash
git add -A docs/superpowers docs/working-specs/2026-06-19-scorecard-derived-cells docs/working-specs/2026-06-23-review-board-token-cost
git commit -m "docs: migrate stray superpowers spec/plan units into docs/working-specs per #ai-plan"
```

---

### Task 5: Generate the committed `INDEX.md` + live drift test

**Files:**
- Create (generated, committed): `docs/working-specs/INDEX.md`
- Modify: `test/spec-index.test.mjs` (append the live drift gate)

**Interfaces:** consumes `scanWorkingSpecs` + `renderIndex` (Task 3) over the full corpus (post-migration, Task 4).

- [ ] **Step 1: Append the drift test**

In `test/spec-index.test.mjs`, add these imports at the top if not present (`readFileSync`, `join`, `fileURLToPath`) and append this test:

```javascript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanWorkingSpecs } from '../src/specindex.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

// Live drift gate: the committed INDEX.md must equal a fresh generation.
test('docs/working-specs/INDEX.md is not stale', () => {
  const dir = join(ROOT, 'docs', 'working-specs');
  const fresh = renderIndex(scanWorkingSpecs(dir));
  const committed = readFileSync(join(dir, 'INDEX.md'), 'utf8');
  assert.equal(committed, fresh, 'INDEX.md is stale -- run `node bin/spec-index.js`');
});
```

(Consolidate the import lines so each module is imported once; `parseSpec`, `renderIndex`, `scanWorkingSpecs` all come from `../src/specindex.js`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/spec-index.test.mjs`
Expected: FAIL — the drift test throws `ENOENT` on the not-yet-generated `docs/working-specs/INDEX.md`.

- [ ] **Step 3: Generate the index**

Run: `node bin/spec-index.js`
Expected: stderr `agentsmith: wrote .../docs/working-specs/INDEX.md`. The file lists every unit (including the two migrated in Task 4) as a table sorted date-desc.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/spec-index.test.mjs`
Expected: PASS — committed (on-disk) INDEX.md equals a fresh render.

- [ ] **Step 5: Commit**

```bash
git add docs/working-specs/INDEX.md test/spec-index.test.mjs
git commit -m "feat(docs): generate committed working-specs INDEX.md + drift test"
```

---

### Task 6: Seed `docs/design-decisions/` with the records-architecture decision

**Files:**
- Create: `docs/design-decisions/README.md` (one-line purpose banner)
- Create: `docs/design-decisions/records-architecture.md`

**Interfaces:** produces the first design-decisions file (lazy, warranted — this work's own cross-cutting decision). `instruction-precedence.md` is intentionally **not** seeded here; that decision's rule (the `instructions/main.md` precedence chain) lives on the separate coexistence PR, not this branch — seeding it here would document a rule not present on this branch.

- [ ] **Step 1: Write the directory banner**

Create `docs/design-decisions/README.md` with exactly:

```markdown
# Design decisions

Standing rationale for cross-cutting choices -- the *why* behind the system as it is now (`#swe-design-decisions`). Mutable, self-replacing, one file per decision; grep a decision's slug to find what references it.
```

- [ ] **Step 2: Write the first decision**

Create `docs/design-decisions/records-architecture.md` with exactly:

```markdown
# Records architecture

**Decision.** The repo keeps two families of records. Present-truth (mutable, self-replacing, kept current): the reference spec (`#swe-reference-spec`, WHAT/HOW now) and this design-decisions log (`#swe-design-decisions`, WHY now). Point-in-time (frozen/dated, the historical record): working specs and plans (`#ai-plan`), future-work, and technical-debts.

**Why.** Provenance was scattered across many frozen working specs; learning the current rationale meant reading several and inferring which still held. A dated, immutable decision log would duplicate the frozen spec's historical role and reintroduce that staleness. A mutable, self-replacing WHY log -- paired many-to-many with the reference spec, linked one-way (present-truth links out by slug; grep a slug for referrers) -- gives a single current-rationale home with no staleness.

**Consequences.** Authoring a decision is a soft `#ai-session-hygiene` prompt scoped by reach, never a `#swe-done` merge gate; `#swe-done` only keeps existing decision files current. Plans are prunable once `Implemented`; specs never are. New working specs carry a Conformance section (`#ai-plan`) reconciled against present-truth.
```

- [ ] **Step 3: Verify discoverability**

Run: `git status --short`
Expected: two new files under `docs/design-decisions/`. (No reverse index is generated — discovery is by slug grep, per `#swe-design-decisions`.)

- [ ] **Step 4: Commit**

```bash
git add docs/design-decisions/README.md docs/design-decisions/records-architecture.md
git commit -m "docs: seed design-decisions log with records-architecture decision"
```

---

### Task 7: Finalize — advance status, regenerate index + AGENTS.md, full suite

**Files:**
- Modify: `docs/working-specs/2026-06-25-records-architecture/spec.md` (`Status:` line)
- Modify: `docs/working-specs/2026-06-25-records-architecture/plan.md` (`Status:` line)
- Modify (generated, committed): `docs/working-specs/INDEX.md`
- Regenerate (generated, **not** committed): `AGENTS.md`, `.agentsmith/`

**Interfaces:** consumes all prior tasks. Produces the merge-ready state.

- [ ] **Step 1: Advance this unit's status to Implemented**

In `docs/working-specs/2026-06-25-records-architecture/spec.md`, change `Status: Draft` to `Status: Implemented`.
In `docs/working-specs/2026-06-25-records-architecture/plan.md`, change `Status: Draft` to `Status: Implemented`.

- [ ] **Step 2: Regenerate the index (now reflecting Implemented)**

Run: `node bin/spec-index.js`
Expected: stderr `agentsmith: wrote .../INDEX.md`; the records-architecture row now shows `Implemented`.

- [ ] **Step 3: Regenerate `AGENTS.md` (gitignored — verify, do not commit)**

Run: `node bin/cli.js`
Expected: stderr `agentsmith: wrote .agentsmith/AGENTS.md` and no `warning --` lines (new + amended rules resolve cleanly).
Run: `node bin/cli.js --root`
Expected: stderr `agentsmith: wrote AGENTS.md`, no warnings.
Confirm both are untracked: `git status --porcelain AGENTS.md .agentsmith` prints nothing tracked-modified (they are gitignored).

- [ ] **Step 4: Run the full suite**

Run: `node --test`
Expected: all tests pass — `instruction-integrity` (ownership + dangling-tag), `spec-index` (pure + drift), and the existing triage suite. `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add docs/working-specs/2026-06-25-records-architecture/spec.md docs/working-specs/2026-06-25-records-architecture/plan.md docs/working-specs/INDEX.md
git commit -m "docs: finalize records-architecture (status Implemented, regenerate index)"
```

---

## Notes for the implementer

- `AGENTS.md` and `.agentsmith/AGENTS.md` are gitignored build artifacts — regenerate to verify a clean build, but **never** `git add` them. `docs/working-specs/INDEX.md` is the opposite: a committed generated file guarded by a drift test.
- `git mv` in Task 4: under PowerShell vs Git Bash the command is identical (`git mv` is git, not the shell). The `mkdir -p` in Step 2 is Git-Bash syntax; under PowerShell use `New-Item -ItemType Directory -Force`.
- Do not prune this unit's `plan.md`: pruning is optional (`#ai-plan` says "may"), and this plan is the record of a substantial change. Pruning the plan mid-execution would also break the subagent-driven ledger.
- If `bin/spec-index.js` picks up an unexpected unit (e.g. an untracked leftover dir in the working tree), the drift test will surface it. Only committed unit dirs should exist under `docs/working-specs/`; investigate any stray before committing INDEX.md.
