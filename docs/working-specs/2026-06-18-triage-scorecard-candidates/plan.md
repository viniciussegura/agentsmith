# Triage scorecard + candidates persistence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the instruction-review dimension scorecard + undrafted "candidates" into `triage.json` and render both in the triage UI.

**Architecture:** Extend the dev-only triage data layer (`devtools/triage-ui/schema.mjs`) with a `scorecard` object and a `candidates[]` list, both migrated-on-read and validated; teach the apply engine to surface `wanted` and log+splice `reject` candidates; surface them in the server report + auto-commit; render a scorecard matrix and candidate list in the vanilla-JS UI; update the skill/agent prose (source tree `tools/claude/**`, regenerated into `.claude/**`).

**Tech Stack:** Node ESM, zero runtime deps, `node:test`. Spec: `docs/working-specs/2026-06-18-triage-scorecard-candidates/spec.md`.

---

## File structure

- `devtools/triage-ui/schema.mjs` — new constants + `validateCandidate` + `validateScorecard`; `validateFile` wiring; `migrateWorksheet` v3.
- `devtools/triage-ui/apply.mjs` — candidate pass (`wanted`/`reject`), early-exit, rewrite closure, `{type:'candidate'}` progress, CLI handler branch.
- `devtools/triage-ui/server.mjs` — `commitApply` `ignored` + reworded message; new exported `hasCommittableChanges`; `/api/apply` candidate progress log.
- `devtools/triage-ui/app.js` + `index.html` + `style.css` — state defaults, scorecard panel, candidate list.
- `tools/claude/agents/instruction-editor.md`, `tools/claude/skills/instruction-review/{SKILL.md,proposal-format.md}`, `tools/claude/commands/instruction-apply.md` — prose; then regenerate.
- Tests: `test/triage-schema.test.mjs`, `test/triage-apply.test.mjs`, `test/triage-server.test.mjs`.

---

## Task 1: Schema — constants, validators, migrate v3

**Files:**
- Modify: `devtools/triage-ui/schema.mjs`
- Test: `test/triage-schema.test.mjs`

- [ ] **Step 1: Write failing tests**

Append to `test/triage-schema.test.mjs` (it already imports from `../devtools/triage-ui/schema.mjs`; add the new names to that import and add `validateScorecard`, `validateCandidate`):

```js
import {
  validateCandidate, validateScorecard, PRIORITIES, CANDIDATE_VERDICTS, SCORECARD_VERDICTS,
} from '../devtools/triage-ui/schema.mjs';

const baseCandidate = (over = {}) => ({
  tag: 'swe-x', kind: 'new-rule', role: 'swe', targetFile: 'instructions/core/swe/swe-x.md',
  gap: 'g', priority: 'high', decision: { verdict: 'park' }, ...over,
});

test('validateCandidate accepts a well-formed park candidate', () => {
  assert.deepEqual(validateCandidate(baseCandidate()), []);
});

test('validateCandidate rejects bad priority, bad verdict, stray draft, details on non-reject', () => {
  assert.ok(validateCandidate(baseCandidate({ priority: 'urgent' })).some((m) => m.includes('priority')));
  assert.ok(validateCandidate(baseCandidate({ decision: { verdict: 'maybe' } })).some((m) => m.includes('verdict')));
  assert.ok(validateCandidate(baseCandidate({ draft: 'x' })).some((m) => m.includes('draft')));
  assert.ok(validateCandidate(baseCandidate({ decision: { verdict: 'wanted', details: 'no' } })).some((m) => m.includes('details')));
});

test('validateCandidate allows optional details on reject', () => {
  assert.deepEqual(validateCandidate(baseCandidate({ decision: { verdict: 'reject', details: 'dupe' } })), []);
  assert.deepEqual(validateCandidate(baseCandidate({ decision: { verdict: 'reject' } })), []);
});

const baseScorecard = (over = {}) => ({
  lenses: ['swe', 'qa'],
  perLens: [{ dimension: 'coverage', cells: [{ lens: 'swe', verdict: 'good' }, { lens: 'qa', verdict: 'weak' }] }],
  global: [{ dimension: 'cohesiveness', verdict: 'strong' }],
  details: [{ dimension: 'coverage', lens: 'qa', file: 'f', tag: 't', note: 'n' }],
  nits: ['x'], ...over,
});

test('validateScorecard accepts null and a well-formed scorecard', () => {
  assert.deepEqual(validateScorecard(null), []);
  assert.deepEqual(validateScorecard(baseScorecard()), []);
  assert.deepEqual(validateScorecard({ lenses: [], perLens: [], global: [], details: [], nits: [] }), []);
});

test('validateScorecard rejects bad verdict and matrix misalignment', () => {
  assert.ok(validateScorecard(baseScorecard({
    perLens: [{ dimension: 'coverage', cells: [{ lens: 'swe', verdict: 'nope' }, { lens: 'qa', verdict: 'good' }] }],
  })).some((m) => m.includes('verdict')));
  // wrong cell count
  assert.ok(validateScorecard(baseScorecard({
    perLens: [{ dimension: 'coverage', cells: [{ lens: 'swe', verdict: 'good' }] }],
  })).some((m) => m.includes('cells.length')));
  // wrong cell lens vs lenses[i]
  assert.ok(validateScorecard(baseScorecard({
    perLens: [{ dimension: 'coverage', cells: [{ lens: 'qa', verdict: 'good' }, { lens: 'swe', verdict: 'good' }] }],
  })).some((m) => m.includes('!= lenses')));
});

test('validateFile is lenient on absent scorecard/candidates but flags present-malformed + dup/overlap', () => {
  const ok = { round: 'r', entries: [baseStrengthen()] };
  assert.deepEqual(validateFile(ok), []); // no scorecard/candidates keys -> still valid
  const dup = { round: 'r', entries: [], candidates: [baseCandidate(), baseCandidate()] };
  assert.ok(validateFile(dup).some((m) => m.includes('duplicate tag')));
  const overlap = { round: 'r', entries: [baseStrengthen()], candidates: [baseCandidate({ tag: baseStrengthen().tag })] };
  assert.ok(validateFile(overlap).some((m) => m.includes('both entries and candidates')));
  const badSc = { round: 'r', entries: [], scorecard: { lenses: 'no', perLens: [], global: [], details: [], nits: [] } };
  assert.ok(validateFile(badSc).some((m) => m.includes('lenses')));
});

test('migrateWorksheet v3 adds scorecard:null + candidates:[] and stays idempotent', () => {
  const m = migrateWorksheet({ round: 'r', entries: [] });
  assert.equal(m.scorecard, null);
  assert.deepEqual(m.candidates, []);
  assert.deepEqual(migrateWorksheet(m), m);
});
```

(`baseStrengthen` already exists in this test file.)

- [ ] **Step 2: Run, verify they fail**

Run: `node --test test/triage-schema.test.mjs`
Expected: FAIL (`validateCandidate`/`validateScorecard`/`PRIORITIES` not exported; migrate lacks new keys).

- [ ] **Step 3: Implement in `schema.mjs`**

Add constants near the existing `KINDS`/`VERDICTS`/`STATES`:

```js
export const PRIORITIES = ['high', 'medium', 'low'];
export const CANDIDATE_VERDICTS = ['park', 'wanted', 'reject'];
export const SCORECARD_VERDICTS = ['strong', 'good', 'weak', 'gaps'];
```

Add the two validators (after `validateEntry`):

```js
/** Validate one candidate (a draft-less, surfaced proposal). Returns problem strings. */
export function validateCandidate(c, where = 'candidate') {
  const p = [];
  if (!isObj(c)) return [`${where}: not an object`];
  const at = nonEmpty(c.tag) ? `candidate "${c.tag}"` : where;
  if (!nonEmpty(c.tag)) p.push(`${at}: missing/empty "tag"`);
  if (!nonEmpty(c.role)) p.push(`${at}: missing/empty "role"`);
  if (!nonEmpty(c.targetFile)) p.push(`${at}: missing/empty "targetFile"`);
  if (!nonEmpty(c.gap)) p.push(`${at}: missing/empty "gap"`);
  if (!KINDS.includes(c.kind)) p.push(`${at}: "kind" must be one of ${KINDS.join('|')}`);
  if (!PRIORITIES.includes(c.priority)) p.push(`${at}: "priority" must be one of ${PRIORITIES.join('|')}`);
  if ('draft' in c) p.push(`${at}: a candidate must not carry "draft"`);
  const d = c.decision;
  if (!isObj(d) || !CANDIDATE_VERDICTS.includes(d.verdict)) {
    p.push(`${at}: "decision.verdict" must be one of ${CANDIDATE_VERDICTS.join('|')}`);
  } else if (d.verdict === 'reject') {
    if ('details' in d && d.details !== undefined && !isStr(d.details)) p.push(`${at}: "decision.details" must be a string`);
  } else if ('details' in d && d.details !== undefined) {
    p.push(`${at}: "decision.details" not allowed for verdict ${d.verdict}`);
  }
  return p;
}

/** Validate the scorecard (null allowed). Enforces matrix alignment; dimension names are open. */
export function validateScorecard(sc, where = 'scorecard') {
  if (sc === null || sc === undefined) return [];
  const p = [];
  if (!isObj(sc)) return [`${where}: must be an object or null`];
  const okLenses = Array.isArray(sc.lenses) && sc.lenses.every(isStr);
  if (!okLenses) p.push(`${where}: "lenses" must be a string[]`);
  const lenses = okLenses ? sc.lenses : [];
  const checkVerdict = (v, w) => {
    if (!SCORECARD_VERDICTS.includes(v)) p.push(`${w}: verdict must be one of ${SCORECARD_VERDICTS.join('|')}`);
  };
  if (!Array.isArray(sc.perLens)) p.push(`${where}: "perLens" must be an array`);
  else sc.perLens.forEach((row, i) => {
    const rw = `${where}.perLens[${i}]`;
    if (!isObj(row) || !nonEmpty(row.dimension)) { p.push(`${rw}: missing "dimension"`); return; }
    if (!Array.isArray(row.cells)) { p.push(`${rw}: "cells" must be an array`); return; }
    if (row.cells.length !== lenses.length) p.push(`${rw}: cells.length (${row.cells.length}) != lenses.length (${lenses.length})`);
    row.cells.forEach((cell, j) => {
      if (!isObj(cell)) { p.push(`${rw}.cells[${j}]: not an object`); return; }
      if (lenses[j] !== undefined && cell.lens !== lenses[j]) p.push(`${rw}.cells[${j}]: lens "${cell.lens}" != lenses[${j}]`);
      checkVerdict(cell.verdict, `${rw}.cells[${j}]`);
    });
  });
  if (!Array.isArray(sc.global)) p.push(`${where}: "global" must be an array`);
  else sc.global.forEach((row, i) => {
    const rw = `${where}.global[${i}]`;
    if (!isObj(row) || !nonEmpty(row.dimension)) p.push(`${rw}: missing "dimension"`);
    else checkVerdict(row.verdict, rw);
  });
  if (!Array.isArray(sc.details)) p.push(`${where}: "details" must be an array`);
  else sc.details.forEach((f, i) => {
    if (!isObj(f) || !nonEmpty(f.file) || !nonEmpty(f.tag) || !nonEmpty(f.note)) {
      p.push(`${where}.details[${i}]: needs file/tag/note`);
    }
  });
  if (!Array.isArray(sc.nits) || !sc.nits.every(isStr)) p.push(`${where}: "nits" must be a string[]`);
  return p;
}
```

Wire into `validateFile` — after the `file.entries.forEach(...)` loop (the loop builds the `seen` set of entry tags), before `return p`:

```js
  if ('scorecard' in file) p.push(...validateScorecard(file.scorecard, 'scorecard'));
  if ('candidates' in file) {
    if (!Array.isArray(file.candidates)) {
      p.push('file: "candidates" must be an array');
    } else {
      const cseen = new Set();
      file.candidates.forEach((c, i) => {
        p.push(...validateCandidate(c, `candidates[${i}]`));
        if (isObj(c) && nonEmpty(c.tag)) {
          if (cseen.has(c.tag)) p.push(`candidate "${c.tag}": duplicate tag`);
          cseen.add(c.tag);
          if (seen.has(c.tag)) p.push(`tag "${c.tag}": present in both entries and candidates`);
        }
      });
    }
  }
```

Replace `migrateWorksheet` body so it always yields the v3 canonical form:

```js
export function migrateWorksheet(file) {
  if (!isObj(file)) return file;
  const entriesIn = Array.isArray(file.entries) ? file.entries : [];
  const entries = entriesIn.map((e) => {
    if (!isObj(e)) return e;
    const { current, ...rest } = e;
    const d = rest.decision;
    if (isObj(d) && ['adopt', 'park'].includes(d.verdict) && 'details' in d) {
      const { details, ...dr } = d;
      rest.decision = dr;
    }
    return rest;
  });
  return {
    ...file,
    scorecard: file.scorecard ?? null,
    candidates: Array.isArray(file.candidates) ? file.candidates : [],
    entries,
  };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `node --test test/triage-schema.test.mjs`
Expected: PASS (all, including the existing migrate idempotency test).

- [ ] **Step 5: Commit**

```bash
git add devtools/triage-ui/schema.mjs test/triage-schema.test.mjs
git commit -F - <<'EOF'
🤖 feat(triage-schema): v3 — scorecard + candidates validation & migration

migrateWorksheet now yields the canonical v3 form (scorecard:null,
candidates:[]); validateFile is lenient on absent keys but validates a present
scorecard (matrix alignment, open dimension names) and each candidate (priority,
park/wanted/reject verdict, no draft), and flags dup/overlap tags.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Usage: model=claude-opus-4-8[1m]
EOF
```

---

## Task 2: apply.mjs — candidate pass + progress

**Files:**
- Modify: `devtools/triage-ui/apply.mjs`
- Test: `test/triage-apply.test.mjs`

- [ ] **Step 1: Write failing tests**

The `fixture(entries)` helper in `test/triage-apply.test.mjs` writes `{ round, entries }`. Add a sibling that also writes candidates, and tests. Append:

```js
function fixtureC(entries, candidates) {
  const { root, triagePath } = fixture(entries);
  const f = JSON.parse(readFileSync(triagePath, 'utf8'));
  f.candidates = candidates;
  writeFileSync(triagePath, JSON.stringify(f, null, 2) + '\n');
  return { root, triagePath };
}

test('wanted candidate is surfaced and left in place', async () => {
  const { root, triagePath } = fixtureC([], [{
    tag: 'swe-new', kind: 'new-rule', role: 'swe', targetFile: 'instructions/core/swe/swe-new.md',
    gap: 'g', priority: 'high', decision: { verdict: 'wanted' },
  }]);
  try {
    const report = await apply({ root, triagePath, gate: NOOP_GATE });
    assert.deepEqual(report.wanted, ['swe-new']);
    assert.equal(readTriage(triagePath).candidates.length, 1); // left
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('reject candidate logs a decisions line and splices', async () => {
  const { root, triagePath } = fixtureC([], [{
    tag: 'swe-bad', kind: 'new-rule', role: 'swe', targetFile: 'instructions/core/swe/swe-bad.md',
    gap: 'g', priority: 'low', decision: { verdict: 'reject', details: 'dupe of swe-x' },
  }]);
  try {
    const report = await apply({ root, triagePath, gate: NOOP_GATE });
    assert.deepEqual(report.ignored, ['swe-bad']);
    assert.match(readFileSync(join(root, 'docs/instruction-rules-decisions.md'), 'utf8'),
      /^- `#swe-bad` -- rejected: dupe of swe-x$/m);
    assert.equal(readTriage(triagePath).candidates.length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('reject candidate without details defaults to "not pursued"', async () => {
  const { root, triagePath } = fixtureC([], [{
    tag: 'swe-bad2', kind: 'new-rule', role: 'swe', targetFile: 'instructions/core/swe/swe-bad2.md',
    gap: 'g', priority: 'low', decision: { verdict: 'reject' },
  }]);
  try {
    await apply({ root, triagePath, gate: NOOP_GATE });
    assert.match(readFileSync(join(root, 'docs/instruction-rules-decisions.md'), 'utf8'),
      /^- `#swe-bad2` -- rejected: not pursued$/m);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a file with only candidates is not short-circuited as nothing-to-apply', async () => {
  const { root, triagePath } = fixtureC([], [{
    tag: 'swe-w', kind: 'new-rule', role: 'swe', targetFile: 'instructions/core/swe/swe-w.md',
    gap: 'g', priority: 'high', decision: { verdict: 'wanted' },
  }]);
  try {
    const report = await apply({ root, triagePath, gate: NOOP_GATE });
    assert.ok(!report.error, 'must process, not return nothing-to-apply');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('onProgress emits candidate events', async () => {
  const { root, triagePath } = fixtureC([], [{
    tag: 'swe-w2', kind: 'new-rule', role: 'swe', targetFile: 'instructions/core/swe/swe-w2.md',
    gap: 'g', priority: 'high', decision: { verdict: 'wanted' },
  }]);
  try {
    const events = [];
    await apply({ root, triagePath, gate: NOOP_GATE, onProgress: (e) => events.push(e) });
    const c = events.find((e) => e.type === 'candidate');
    assert.equal(c.tag, 'swe-w2');
    assert.equal(c.outcome, 'wanted');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
```

Add `writeFileSync` to the existing `node:fs` import in this test file if absent.

- [ ] **Step 2: Run, verify fail**

Run: `node --test test/triage-apply.test.mjs`
Expected: FAIL (`report.wanted`/`report.ignored` undefined; candidates ignored; nothing-to-apply on candidates-only).

- [ ] **Step 3: Implement in `apply.mjs`**

In `apply()`, change the early-exit + report + state setup. Replace:

```js
  if (!existsSync(triagePath)) return { error: 'nothing to apply' };
  const file = migrateWorksheet(JSON.parse(read(triagePath)));
  if (!Array.isArray(file.entries) || file.entries.length === 0) return { error: 'nothing to apply' };
```

with:

```js
  if (!existsSync(triagePath)) return { error: 'nothing to apply' };
  const file = migrateWorksheet(JSON.parse(read(triagePath)));
  const hasEntries = Array.isArray(file.entries) && file.entries.length > 0;
  const hasCandidates = Array.isArray(file.candidates) && file.candidates.length > 0;
  if (!hasEntries && !hasCandidates) return { error: 'nothing to apply' };
```

Add `wanted`/`ignored` to the report object literal:

```js
  const report = { adopted: [], rejected: [], folded: [], deferred: [], refined: [], parked: [], skipped: [], wanted: [], ignored: [], failed: [] };
```

Add `candidates` as a rebindable `let` and include it in `rewrite`:

```js
  let entries = file.entries;
  let candidates = Array.isArray(file.candidates) ? file.candidates : [];
  const rewrite = () => atomicWrite(triagePath, canonicalJSON({ ...file, entries, candidates }));
```

After the entries `while` loop (just before `return report;`), add the candidate pass:

```js
  // --- candidate pass (runs after the entries loop) ---
  let ci = 0;
  while (ci < candidates.length) {
    const c = candidates[ci];
    const v = c.decision?.verdict || 'park';
    if (v === 'wanted') {
      report.wanted.push(c.tag);
      emit({ type: 'candidate', tag: c.tag, outcome: 'wanted' });
      ci++;
      continue;
    }
    if (v === 'reject') {
      try {
        const details = (c.decision.details && c.decision.details.trim()) || 'not pursued';
        ensureDecisionLine(decisionsPath, 'reject', { tag: c.tag, decision: { details } });
      } catch (err) {
        report.failed.push({ tag: c.tag, reason: String(err.message || err) });
        emit({ type: 'candidate', tag: c.tag, outcome: 'failed' });
        ci++;
        continue;
      }
      candidates = candidates.filter((x) => x !== c);
      rewrite();
      report.ignored.push(c.tag);
      emit({ type: 'candidate', tag: c.tag, outcome: 'ignored' });
      continue; // ci unchanged: the array shrank
    }
    emit({ type: 'candidate', tag: c.tag, outcome: 'parked' });
    ci++;
  }
```

Update the CLI `onProgress` handler at the bottom of the file — add a candidate branch after the `start` branch:

```js
  const onProgress = (ev) => {
    if (ev.type === 'start') process.stderr.write(`applying ${ev.total} entr${ev.total === 1 ? 'y' : 'ies'}…\n`);
    else if (ev.type === 'candidate') process.stderr.write(`  candidate #${ev.tag} -> ${ev.outcome}\n`);
    else if (ev.phase === 'begin') process.stderr.write(`  [${ev.i + 1}/${ev.total}] #${ev.tag} (${ev.verdict})\n`);
    else if (ev.phase === 'gate') process.stderr.write(`        running node --test…\n`);
    else if (ev.phase === 'done') process.stderr.write(`        -> ${ev.outcome}\n`);
  };
```

- [ ] **Step 4: Run, verify pass**

Run: `node --test test/triage-apply.test.mjs`
Expected: PASS (new + existing, incl. the prior `onProgress` adopt test and `nothing to apply` empty test — empty `fixture([])` has no candidates, so still returns nothing-to-apply).

- [ ] **Step 5: Commit**

```bash
git add devtools/triage-ui/apply.mjs test/triage-apply.test.mjs
git commit -F - <<'EOF'
🤖 feat(triage-apply): candidate pass — surface wanted, log+splice reject

apply() now processes candidates after the entries loop: wanted -> report.wanted
(left for the agent to draft); reject -> decisions-log line (details default
"not pursued") + splice, per-candidate try/catch; both-empty early-exit; rewrite
closure carries candidates; {type:'candidate'} progress events + CLI handler.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Usage: model=claude-opus-4-8[1m]
EOF
```

---

## Task 3: server.mjs — commitApply ignored + candidate progress log

**Files:**
- Modify: `devtools/triage-ui/server.mjs`
- Test: `test/triage-server.test.mjs`

- [ ] **Step 1: Write failing test**

Append to `test/triage-server.test.mjs` (add `hasCommittableChanges` to the schema/server import as appropriate — it will be exported from `server.mjs`):

```js
import { hasCommittableChanges } from '../devtools/triage-ui/server.mjs';

test('hasCommittableChanges: true for ignored-only, false for wanted-only', () => {
  assert.equal(hasCommittableChanges({ adopted: [], rejected: [], folded: [], deferred: [], ignored: ['x'], wanted: [] }), true);
  assert.equal(hasCommittableChanges({ adopted: [], rejected: [], folded: [], deferred: [], ignored: [], wanted: ['y'] }), false);
});

test('PUT round-trips a file carrying scorecard + candidates', async () => {
  const triagePath = tmpTriage();
  await withServer({ triagePath }, async (base) => {
    const data = {
      round: '2026-06-18',
      scorecard: { lenses: ['swe'], perLens: [{ dimension: 'coverage', cells: [{ lens: 'swe', verdict: 'good' }] }], global: [{ dimension: 'cohesiveness', verdict: 'strong' }], details: [], nits: [] },
      candidates: [{ tag: 'swe-c', kind: 'new-rule', role: 'swe', targetFile: 'instructions/core/swe/swe-c.md', gap: 'g', priority: 'high', decision: { verdict: 'park' } }],
      entries: [],
    };
    const put = await fetch(`${base}/api/triage`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, version: null }),
    });
    assert.equal(put.status, 200);
    const got = await (await fetch(`${base}/api/triage`)).json();
    assert.deepEqual(got.data.candidates, data.candidates);
    assert.deepEqual(got.data.scorecard, data.scorecard);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `node --test test/triage-server.test.mjs`
Expected: FAIL (`hasCommittableChanges` not exported).

- [ ] **Step 3: Implement in `server.mjs`**

Extract + export the "did anything change" predicate, and use it in `commitApply`. Replace the head of `commitApply`:

```js
function commitApply(root, report) {
  const committable = ['adopted', 'rejected', 'folded', 'deferred', 'ignored'];
  if (!hasCommittableChanges(report)) return null;
  const summary = committable.filter((k) => report[k]?.length).map((k) => `${k} ${report[k].length}`).join(', ');
  const tags = committable.flatMap((k) => report[k] || []);
  const msg = [
    `🤖 chore(instructions): Apply triage (${summary})`,
    '',
    'Applied via the triage UI Apply button; adopts gated on node --test.',
    ...tags.map((t) => `- #${t}`),
    '',
    'Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>',
  ].join('\n');
  // ... unchanged git add/commit/rev-parse ...
}
```

Add the exported predicate above `commitApply`:

```js
/** True when the apply report changed a committed file (decisions log or instructions). */
export function hasCommittableChanges(report) {
  return ['adopted', 'rejected', 'folded', 'deferred', 'ignored'].some((k) => (report[k]?.length || 0) > 0);
}
```

In the `POST /api/apply` handler's `onProgress`, add a candidate branch:

```js
        const onProgress = (ev) => {
          if (ev.type === 'start') console.log(`[apply] ${ev.total} entr${ev.total === 1 ? 'y' : 'ies'}…`);
          else if (ev.type === 'candidate') console.log(`[apply] candidate #${ev.tag} -> ${ev.outcome}`);
          else if (ev.phase === 'begin') console.log(`[apply] [${ev.i + 1}/${ev.total}] #${ev.tag} (${ev.verdict})`);
          else if (ev.phase === 'gate') console.log('[apply]         running node --test…');
          else if (ev.phase === 'done') console.log(`[apply]         -> ${ev.outcome}`);
        };
```

(Validation of candidates/scorecard already happens via the existing `validateFile` call in `PUT /api/triage`; no change needed there.)

- [ ] **Step 4: Run, verify pass**

Run: `node --test test/triage-server.test.mjs`
Expected: PASS (new + existing; the dirty-base preflight test still accepts 200/409/500).

- [ ] **Step 5: Commit**

```bash
git add devtools/triage-ui/server.mjs test/triage-server.test.mjs
git commit -F - <<'EOF'
🤖 feat(triage-server): commit ignored candidates; candidate progress log

commitApply gains the `ignored` bucket (count + summary + reworded message),
exposed via a new exported hasCommittableChanges; /api/apply logs candidate
progress events to the triage terminal.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Usage: model=claude-opus-4-8[1m]
EOF
```

---

## Task 4: UI — scorecard panel + candidate list

**Files:**
- Modify: `devtools/triage-ui/app.js`, `devtools/triage-ui/index.html`, `devtools/triage-ui/style.css`

No automated tests (browser asset, consistent with the rest of the UI). Verify by manual smoke (Step 4).

- [ ] **Step 1: State defaults + load normalization (`app.js`)**

Change the `state` initializer:

```js
const state = { data: { round: '', entries: [], candidates: [], scorecard: null }, version: null, tags: [], sel: 0 };
```

In `load()`, after `state.data = t.data || {...}`, normalize:

```js
    state.data = t.data || { round: '', entries: [], candidates: [], scorecard: null };
    state.data.candidates = state.data.candidates ?? [];
    state.data.scorecard = state.data.scorecard ?? null;
```

- [ ] **Step 2: Render scorecard + candidates (`app.js`)**

Add a `renderScorecard()` and `renderCandidates()` and call both from `render()` (after `renderSidebar()`):

```js
const ICON = { strong: '🟢', good: '🔵', weak: '🟡', gaps: '🔴' };

function renderScorecard() {
  const host = $('#scorecard');
  const sc = state.data.scorecard;
  if (!sc) { host.replaceChildren(); return; }
  const kids = [];
  if (sc.lenses && sc.lenses.length && sc.perLens && sc.perLens.length) {
    const head = el('div', { class: 'scrow head' }, [
      el('div', { class: 'sccell lbl', text: 'dimension' }),
      ...sc.lenses.map((l) => el('div', { class: 'sccell lbl', text: l })),
    ]);
    const rows = sc.perLens.map((row) => el('div', { class: 'scrow' }, [
      el('div', { class: 'sccell lbl', text: row.dimension }),
      ...row.cells.map((c) => el('div', { class: 'sccell', title: c.verdict, text: ICON[c.verdict] || '?' })),
    ]));
    kids.push(el('div', { class: 'scmatrix' }, [head, ...rows]));
  }
  if (sc.global && sc.global.length) {
    kids.push(el('div', { class: 'scglobal' }, sc.global.map((g) =>
      el('div', { class: 'scg' }, [el('span', { text: `${ICON[g.verdict] || '?'} ` }), el('span', { text: g.dimension })]))));
  }
  if (sc.details && sc.details.length) {
    kids.push(el('div', { class: 'scdetails' }, sc.details.map((d) =>
      el('div', { class: 'scd', text: `${d.dimension}${d.lens ? ' · ' + d.lens : ''} · ${d.file} · #${d.tag} · ${d.note}` }))));
  }
  if (sc.nits && sc.nits.length) {
    kids.push(el('div', { class: 'scnits' }, sc.nits.map((n) => el('div', { class: 'scn', text: `• ${n}` }))));
  }
  host.replaceChildren(el('details', { class: 'sccard', open: 'true' }, [
    el('summary', { text: 'Scorecard' }), ...kids,
  ]));
}

const PRI_RANK = { high: 0, medium: 1, low: 2 };
function renderCandidates() {
  const host = $('#candidates');
  const cs = [...(state.data.candidates || [])].sort((a, b) =>
    (PRI_RANK[a.priority] - PRI_RANK[b.priority]) || a.tag.toLowerCase().localeCompare(b.tag.toLowerCase()));
  if (!cs.length) { host.replaceChildren(); return; }
  const rows = cs.map((c) => {
    const sel = el('select', { class: 'cverdict', onchange: (e) => {
      c.decision = { verdict: e.target.value }; // park/wanted/reject; details left for the worksheet
      scheduleSave();
    } }, ['park', 'wanted', 'reject'].map((v) =>
      el('option', { value: v, ...(c.decision?.verdict === v ? { selected: 'true' } : {}), text: v })));
    return el('div', { class: 'crow' }, [
      el('span', { class: `cpri ${c.priority}`, text: c.priority }),
      el('span', { class: 'ctag', text: `#${c.tag}`, title: c.gap }),
      sel,
    ]);
  });
  host.replaceChildren(el('div', { class: 'chead', text: `Candidates (${cs.length})` }), ...rows);
}
```

Call them in `render()`:

```js
function render() {
  const total = state.data.entries.length;
  $('#counter').textContent = total ? `${decidedCount()}/${total} decided` : '';
  renderScorecard();
  renderCandidates();
  if (!total) { $('#sidebar').replaceChildren(); $('#detail').replaceChildren(el('div', { class: 'empty', text: 'No entries. Run /instruction-review.' })); return; }
  renderSidebar();
  renderDetail();
}
```

- [ ] **Step 3: Markup + styles**

`index.html` — add the two hosts inside `<main>`, before `#detail` (or in the sidebar column). Add into the `<aside id="sidebar">` column area:

```html
  <main>
    <aside id="sidebar-col">
      <div id="scorecard"></div>
      <aside id="sidebar" aria-label="entries"></aside>
      <div id="candidates" aria-label="candidates"></div>
    </aside>
    <section id="detail"></section>
  </main>
```

(Replace the existing `<aside id="sidebar" ...></aside>` line accordingly; keep `#detail`.)

`style.css` — append:

```css
#sidebar-col { width: 300px; flex-shrink: 0; overflow-y: auto; border-right: 1px solid var(--border); background: var(--panel); display: flex; flex-direction: column; }
#sidebar-col #sidebar { width: auto; border-right: none; }
.sccard { padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 12px; }
.sccard summary { cursor: pointer; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.scmatrix { margin: 8px 0; display: grid; gap: 1px; }
.scrow { display: grid; grid-template-columns: 1.4fr repeat(var(--cols, 9), 1fr); gap: 1px; }
.sccell { padding: 2px 4px; text-align: center; }
.sccell.lbl { color: var(--muted); font-size: 10px; text-align: left; overflow: hidden; text-overflow: ellipsis; }
.scglobal { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0; }
.scdetails .scd, .scnits .scn { color: var(--muted); margin: 2px 0; }
.chead { padding: 7px 12px; color: var(--muted); font-size: 11px; text-transform: uppercase; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.crow { display: flex; align-items: center; gap: 6px; padding: 5px 12px; border-bottom: 1px solid var(--border); }
.crow .ctag { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cpri { font-size: 9px; padding: 1px 5px; border-radius: 8px; border: 1px solid var(--border); text-transform: uppercase; }
.cpri.high { color: var(--del-fg); border-color: var(--del-fg); }
.cpri.medium { color: var(--accent); }
.cpri.low { color: var(--muted); }
.cverdict { width: auto; padding: 2px 4px; font-size: 11px; }
```

The matrix `--cols` is set inline by the renderer; add to `renderScorecard()` the line after building the matrix node: set `kids[0]` matrix style — simplest, set on each `.scrow` via `el('div',{class:'scrow', style:\`grid-template-columns:1.4fr repeat(${sc.lenses.length},1fr)\`}, ...)`. Update both the `head` and `rows` el() calls to include that inline `style` instead of relying on `--cols`.

- [ ] **Step 4: Manual smoke**

Run: `node bin/cli.js >/dev/null` then `node devtools/triage-ui/server.mjs` (or `npm run triage`), open the URL. With the live worksheet empty, the scorecard/candidate areas are empty and the page renders without errors (check the browser console). Then temporarily hand-add a `scorecard` + `candidates` block to `.agentsmith/instruction-review/triage.json` and reload to confirm the matrix + candidate `<select>` render and saving works. Revert the hand-edit.

Expected: no console errors on an empty/pre-v3 file; matrix + candidates render when present; changing a candidate `<select>` shows `saved`.

- [ ] **Step 5: Commit**

```bash
git add devtools/triage-ui/app.js devtools/triage-ui/index.html devtools/triage-ui/style.css
git commit -F - <<'EOF'
🤖 feat(triage-ui): scorecard matrix panel + candidate list

Render the persisted scorecard as a dimensions×lens matrix with verdict icons
(global rows + flat details + nits below), and the candidates list in the
sidebar sorted by priority with a park/wanted/reject <select>. State normalizes
candidates/scorecard defaults so a pre-v3 file renders without crashing.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Usage: model=claude-opus-4-8[1m]
EOF
```

---

## Task 5: Skill / agent / doc prose (source tree) + regenerate

**Files:**
- Modify: `tools/claude/agents/instruction-editor.md`
- Modify: `tools/claude/skills/instruction-review/SKILL.md`
- Modify: `tools/claude/skills/instruction-review/proposal-format.md`
- Modify: `tools/claude/commands/instruction-apply.md`
- Then: `node bin/cli.js` regenerates the `.claude/**` copies.

No unit test (prose). Verification is regeneration + `node --test` staying green + a manual read.

- [ ] **Step 1: instruction-editor.md Output contract**

In `tools/claude/agents/instruction-editor.md`, change the Output section to require returning `{ scorecard, candidates, entries }`:

> ## Output
>
> Return (no file writes) a single object `{ scorecard, candidates, entries }`:
> - `scorecard` — the dimension matrix: `{ lenses[], perLens[{dimension, cells[{lens, verdict}]}], global[{dimension, verdict}], details[{dimension, lens?, file, tag, note}], nits[] }`, verdict ∈ strong|good|weak|gaps. Cells align with `lenses` positionally.
> - `candidates` — every verified-but-undrafted proposal as `{ tag, kind, role, targetFile, gap, priority }` (priority high|medium|low), `decision` defaulting to `{verdict:'park'}`. No `draft`.
> - `entries` — the drafted proposals, projected onto the `triage.json` entry schema (each `decision` defaults to `{verdict:'park'}`, `applyLog: []`).
>
> `/instruction-apply`, not you, writes the decisions log and any adoption into `instructions/`.

- [ ] **Step 2: SKILL.md step-5 worksheet shape + step-1 gate**

In `tools/claude/skills/instruction-review/SKILL.md`:
- Step 5 worksheet shape: change `{ round: string, entries: Entry[] }` to `{ round: string, scorecard: Scorecard|null, candidates: Candidate[], entries: Entry[] }`, and state the skill writes all three (scorecard from the editor, candidates undrafted with priority, entries drafted).
- Step 1 "Consider parked" gate: append candidate/scorecard semantics: "`scorecard` is overwritten with the new round's; `candidates` merge by tag — a fresh candidate whose tag is live or in the decisions log is dropped; one matching an existing entry is dropped; one matching an existing candidate replaces it unless that candidate is hand-edited (`wanted`/`reject`); a fresh entry whose tag matches an existing candidate drops the candidate; un-revisited candidates survive."

- [ ] **Step 3: proposal-format.md shapes + flow**

In `tools/claude/skills/instruction-review/proposal-format.md`, add a "Persisted worksheet (scorecard + candidates)" subsection with the `Scorecard` and `Candidate` TypeScript from the spec §Data model, and the candidate verdict table (`park` left; `wanted` → `/instruction-apply` agent drafts into a parked entry; `reject` → engine logs + splices).

- [ ] **Step 4: instruction-apply.md promotion + guard + hand-edit exception**

In `tools/claude/commands/instruction-apply.md`:
- Change "absent or has no entries" → "absent or has no entries **and** no candidates".
- Remove/qualify "it does not hand-edit files itself": add that the `wanted` promotion is the explicit exception — after `node devtools/triage-ui/apply.mjs` exits, for each `wanted` candidate in the report the agent reads `.agentsmith/instruction-review/triage.json`, migrates it, authors a house-style (#code-markdown) draft, builds the promoted entry (`verdict: park`, `status: ready`, draft filled, fields inherited), removes the candidate, validates the whole file locally, and writes it in **one** atomic write (one candidate at a time); on a 409/validation failure neither mutation persists.

- [ ] **Step 5: Regenerate + verify**

Run:
```bash
node bin/cli.js
node --test
```
Expected: regeneration writes the `.claude/**` copies (incl. `.claude/agents/instruction-editor.md`, `.claude/skills/instruction-review/*`, `.claude/commands/instruction-apply.md`); `node --test` stays green (139+ tests). Spot-read one regenerated file to confirm the new prose is present.

- [ ] **Step 6: Commit**

```bash
git add tools/claude .claude
git commit -F - <<'EOF'
🤖 docs(instruction-review): persist scorecard + candidates in the pipeline

instruction-editor returns {scorecard, candidates, entries}; SKILL.md step-5
worksheet shape + step-1 consider-parked merge rules updated; proposal-format
documents the Scorecard/Candidate shapes and park/wanted/reject flow;
instruction-apply documents the wanted-promotion atomic-write exception and the
entries-and-candidates early exit. Regenerated .claude/**.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Usage: model=claude-opus-4-8[1m]
EOF
```

---

## Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite + generator**

Run:
```bash
node bin/cli.js
node --test
```
Expected: generator clean (the only warning is the pre-existing `#code-style -> bundle-only #ui-design-tokens`); `node --test` all green (≈150 tests).

- [ ] **Step 2: Devtools-not-shipped guard**

Run: `node --test` already includes the export/packaging guard test; confirm it passes (devtools + the new code never ship). No separate action.

- [ ] **Step 3: CLI apply smoke (no-op safe)**

Run: `node devtools/triage-ui/apply.mjs`
Expected: with the live worksheet empty, prints `{"error":"nothing to apply"}` or processes nothing — no crash.

---

## Self-review

**Spec coverage:** Data model (T1), schema v3 + validators + leniency + matrix alignment (T1), apply candidate pass + early-exit + rewrite + progress (T2), commitApply ignored + hasCommittableChanges + candidate log (T3), UI scorecard matrix + candidates + state defaults (T4), editor/SKILL/proposal-format/instruction-apply prose + consider-parked + wanted-promotion + hand-edit exception (T5), final gate (T6). All spec sections mapped.

**Placeholders:** none — every code step shows the code; doc steps quote the exact prose.

**Type consistency:** `scorecard`/`candidates` keys, `validateScorecard`/`validateCandidate`/`hasCommittableChanges` names, candidate verdicts `park|wanted|reject`, report buckets `wanted|ignored`, progress `{type:'candidate', tag, outcome}` — consistent across T1–T5.
