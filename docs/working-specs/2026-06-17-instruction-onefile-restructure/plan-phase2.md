# Triage workflow v2 — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make triage self-contained: clean verdict semantics, live `current` read from the rule file, a shared `apply.mjs` engine driven by both a UI Apply button and a thin `/instruction-apply`, and per-entry refine replies shown in the UI.

**Architecture:** Schema v2 (drop `current`, forbid `details` on adopt/park, add `lastRoundReply`), applied in-memory on read. A committed `devtools/triage-ui/apply.mjs` writes/creates rule files (no section splice — Phase 1 made a rule a whole file), writes decisions-log lines, splices terminals atomically, gated by a child-process `node --test`. The server gains `GET /api/rule` (live diff source) and `POST /api/apply` (lock + clean-base preflight).

**Tech Stack:** Node built-in `http`, vanilla front-end, `node --test`, zero deps.

**Spec:** `docs/working-specs/2026-06-17-instruction-onefile-restructure/spec.md` (Phase 2 = §2.1–§2.4). **Depends on Phase 1.**

---

## File structure

- Modify `devtools/triage-ui/schema.mjs` — v2 validation; `migrateWorksheet(obj)`.
- Create `devtools/triage-ui/apply.mjs` — `apply()` engine + CLI.
- Modify `devtools/triage-ui/server.mjs` — migrate-then-tokenize on read; `GET /api/rule`; `POST /api/apply` with lock + 423; preflight.
- Modify `devtools/triage-ui/app.js` — fetch live rule for the diff; Apply button; hide note for adopt/park; render `lastRoundReply`; branch on 423.
- Modify `devtools/triage-ui/index.html` / `style.css` — Apply button + report area + reply panel.
- Modify `tools/claude/commands/instruction-apply.md` — thin: validate → `apply()` → report.
- Tests: `test/triage-schema.test.mjs`, `test/triage-apply.test.mjs` (new), `test/triage-server.test.mjs`.

---

## Task 1: schema v2 + worksheet migration

**Files:**
- Modify: `devtools/triage-ui/schema.mjs`
- Test: `test/triage-schema.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
import { migrateWorksheet } from '../devtools/triage-ui/schema.mjs';

test('v2: details forbidden on adopt/park', () => {
  const base = { tag: 't', role: 'swe', targetFile: 'instructions/core/swe/t.md',
    status: { state: 'ready' }, gap: 'g', kind: 'new-rule', draft: '# #t', applyLog: [] };
  assert.notDeepEqual(validateEntry({ ...base, decision: { verdict: 'adopt', details: 'x' } }), []);
  assert.deepEqual(validateEntry({ ...base, decision: { verdict: 'adopt' } }), []);
});

test('v2: strengthen no longer requires current', () => {
  const e = { tag: 't', role: 'swe', targetFile: 'f', status: { state: 'ready' }, gap: 'g',
    kind: 'strengthen', draft: '# #t', decision: { verdict: 'park' }, applyLog: [] };
  assert.deepEqual(validateEntry(e), []); // no `current` needed
});

test('v2: lastRoundReply must be a string when present', () => {
  const e = { tag: 't', role: 'swe', targetFile: 'f', status: { state: 'ready' }, gap: 'g',
    kind: 'new-rule', draft: '# #t', decision: { verdict: 'refine', details: 'q' }, applyLog: [], lastRoundReply: 5 };
  assert.notDeepEqual(validateEntry(e), []);
  assert.deepEqual(validateEntry({ ...e, lastRoundReply: '' }), []); // empty allowed
});

test('migrateWorksheet strips current + adopt/park details, idempotent', () => {
  const wrk = { round: 'r', entries: [
    { tag: 'a', role: 'swe', targetFile: 'f', status: { state: 'ready' }, gap: 'g', kind: 'strengthen',
      current: '# #a old', draft: '# #a new', decision: { verdict: 'adopt', details: 'note' }, applyLog: [] },
  ] };
  const m = migrateWorksheet(wrk);
  assert.equal(m.entries[0].current, undefined);
  assert.equal(m.entries[0].decision.details, undefined);
  assert.deepEqual(validateFile(m), []);
  assert.deepEqual(migrateWorksheet(m), m); // idempotent
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/triage-schema.test.mjs`
Expected: FAIL — current schema requires `strengthen.current`, allows adopt details, has no `lastRoundReply` rule, no `migrateWorksheet`.

- [ ] **Step 3: Implement in `devtools/triage-ui/schema.mjs`**

In `validateEntry`:
- Remove the `strengthen` requirement of `current`; for `strengthen` require only `draft`. (Leave `new-rule` as `draft`-only; a present `current` on any kind is ignored, not an error — keep backward read tolerance, but `migrateWorksheet` strips it.)
- After the verdict checks, forbid `details` on adopt/park:

```js
    if (['adopt', 'park'].includes(d.verdict) && 'details' in d && d.details !== undefined) {
      p.push(`${at}: "decision.details" not allowed for verdict ${d.verdict}`);
    }
```

- Validate `lastRoundReply`:

```js
  if ('lastRoundReply' in entry && entry.lastRoundReply !== undefined && !isStr(entry.lastRoundReply)) {
    p.push(`${at}: "lastRoundReply" must be a string`);
  }
```

Add the migrator:

```js
/** Bring a pre-v2 worksheet object to v2: drop `current`, drop adopt/park details. Idempotent. */
export function migrateWorksheet(file) {
  if (!isObj(file) || !Array.isArray(file.entries)) return file;
  const entries = file.entries.map((e) => {
    if (!isObj(e)) return e;
    const { current, ...rest } = e;
    const d = rest.decision;
    if (isObj(d) && ['adopt', 'park'].includes(d.verdict) && 'details' in d) {
      const { details, ...dr } = d;
      rest.decision = dr;
    }
    return rest;
  });
  return { ...file, entries };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/triage-schema.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add devtools/triage-ui/schema.mjs test/triage-schema.test.mjs
git commit -m "$(printf '%s' '🤖 feat(triage-ui): schema v2 (no current, no adopt/park note, lastRoundReply)

Usage: model=claude-opus-4-8[1m]
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2: `apply.mjs` engine

**Files:**
- Create: `devtools/triage-ui/apply.mjs`
- Test: create `test/triage-apply.test.mjs`

- [ ] **Step 1: Write failing tests (against a temp repo fixture)**

`test/triage-apply.test.mjs` builds a tiny `instructions/` tree + `triage.json` in a temp dir and calls `apply({ root, triagePath, runTests: false })`:

```js
import { apply } from '../devtools/triage-ui/apply.mjs';
// ... mkdtemp, write instructions/core/swe/{_intro.md,swe-x.md}, ownership.yaml, triage.json ...

test('adopt strengthen overwrites the rule file and splices the entry', async () => {
  // triage entry: kind strengthen, targetFile instructions/core/swe/swe-x.md, draft '# #swe-x new', verdict adopt
  const report = await apply({ root, triagePath, runTests: false });
  assert.deepEqual(report.adopted, ['swe-x']);
  assert.match(readFileSync(join(root, 'instructions/core/swe/swe-x.md'), 'utf8'), /# #swe-x new/);
  const wrk = JSON.parse(readFileSync(triagePath, 'utf8'));
  assert.equal(wrk.entries.find((e) => e.tag === 'swe-x'), undefined); // spliced
});

test('adopt new-rule creates the file and the ownership row', async () => {
  // entry: kind new-rule, tag swe-new, targetFile instructions/core/swe/swe-new.md, role swe
  const report = await apply({ root, triagePath, runTests: false });
  assert.ok(report.adopted.includes('swe-new'));
  assert.ok(existsSync(join(root, 'instructions/core/swe/swe-new.md')));
  assert.match(readFileSync(join(root, 'instructions/ownership.yaml'), 'utf8'), /^\s+swe-new: swe$/m);
});

test('reject writes a canonical decisions-log line and splices', async () => {
  const report = await apply({ root, triagePath, runTests: false });
  assert.ok(report.rejected.includes('foo'));
  assert.match(readFileSync(join(root, 'docs/instruction-rules-decisions.md'), 'utf8'),
    /^- `#foo` -- rejected: because$/m);
});

test('rehome/reowner are reported skipped, untouched', async () => {
  const report = await apply({ root, triagePath, runTests: false });
  assert.ok(report.skipped.includes('rh'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/triage-apply.test.mjs`
Expected: FAIL — `apply.mjs` does not exist.

- [ ] **Step 3: Implement `devtools/triage-ui/apply.mjs`**

```js
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { validateFile, validateCrossRefs, canonicalJSON, migrateWorksheet } from './schema.mjs';

const read = (p) => readFileSync(p, 'utf8');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function atomicWrite(path, content) {
  const tmp = path + '.tmp';
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

function ensureOwnerRow(ownershipPath, tag, owner) {
  const text = read(ownershipPath);
  const lines = text.split('\n');
  if (lines.some((l) => new RegExp('^\\s+' + esc(tag) + ':\\s').test(l))) return;
  let last = -1;
  const valRe = new RegExp('^  [\\w-]+:\\s*' + esc(owner) + '\\s*$');
  for (let k = 0; k < lines.length; k++) if (valRe.test(lines[k])) last = k;
  const row = `  ${tag}: ${owner}`;
  if (last === -1) { writeFileSync(ownershipPath, text.replace(/\n+$/, '') + '\n' + row + '\n'); return; }
  lines.splice(last + 1, 0, row);
  writeFileSync(ownershipPath, lines.join('\n'));
}

function ensureDecisionLine(decisionsPath, verdict, e) {
  const lines = read(decisionsPath).split('\n');
  const tag = e.tag;
  const d = e.decision;
  const base = require; // placeholder removed below
  const line =
    verdict === 'reject' ? `- \`#${tag}\` -- rejected: ${d.details}`
    : verdict === 'fold' ? `- \`#${tag}\` -- folded into \`${d.foldTarget}\`: ${d.details}`
    : `- \`#${tag}\` -- deferred: ${d.details} (-> ${e.targetFile.split('/').pop()}, ${e.role})`;
  const header = { reject: '## Rejected', fold: '## Folded', defer: '## Deferred' }[verdict];
  const tagRe = new RegExp('^- `#' + esc(tag) + '`\\s+--\\s');
  const ix = lines.findIndex((l) => tagRe.test(l));
  if (ix !== -1) { lines[ix] = line; writeFileSync(decisionsPath, lines.join('\n')); return; }
  let h = lines.findIndex((l) => l.trim() === header);
  if (h === -1) throw new Error(`no "${header}" section in decisions log`);
  let end = h + 1; while (end < lines.length && !/^## /.test(lines[end])) end++;
  let ins = end; while (ins > h + 1 && lines[ins - 1].trim() === '') ins--;
  lines.splice(ins, 0, line);
  writeFileSync(decisionsPath, lines.join('\n'));
}

export async function apply({ root, triagePath, runTests = true, testTimeoutMs = 120000 }) {
  const ownershipPath = join(root, 'instructions/ownership.yaml');
  const decisionsPath = join(root, 'docs/instruction-rules-decisions.md');
  const file = migrateWorksheet(JSON.parse(read(triagePath)));
  const liveTags = []; // gather from cli only if fold entries exist (kept simple here)
  const problems = [...validateFile(file), ...validateCrossRefs(file, { liveTags, resolvableOwners: [] })];
  if (problems.length) return { error: 'invalid', problems };

  const report = { adopted: [], rejected: [], folded: [], deferred: [], refined: [], parked: [], skipped: [], failed: [] };
  const rewrite = (entries) => atomicWrite(triagePath, canonicalJSON({ ...file, entries }));
  let entries = file.entries, i = 0;

  const gate = () => {
    execFileSync('node', ['bin/cli.js'], { cwd: root, stdio: 'pipe' });
    if (runTests) execFileSync('node', ['--test'], { cwd: root, stdio: 'pipe', timeout: testTimeoutMs });
  };

  while (i < entries.length) {
    const e = entries[i];
    const v = e.decision?.verdict || 'park';
    const done = () => { entries = entries.filter((x) => x !== e); rewrite(entries); };

    if (v === 'refine') { report.refined.push({ tag: e.tag, details: e.decision.details, reply: e.lastRoundReply }); i++; continue; }
    if (v === 'park') { report.parked.push(e.tag); i++; continue; }
    if (e.kind === 'rehome' || e.kind === 'reowner') { report.skipped.push(e.tag); i++; continue; }

    if (v === 'reject' || v === 'fold' || v === 'defer') {
      try { ensureDecisionLine(decisionsPath, v, e); }
      catch (err) { report.failed.push({ tag: e.tag, reason: String(err.message || err) }); i++; continue; }
      report[v === 'reject' ? 'rejected' : v === 'fold' ? 'folded' : 'deferred'].push(e.tag);
      done(); continue;
    }

    if (v === 'adopt') {
      if (e.status?.state !== 'ready') { report.failed.push({ tag: e.tag, reason: 'status not ready' }); i++; continue; }
      const abs = join(root, e.targetFile);
      const snap = new Map();
      snap.set(abs, existsSync(abs) ? read(abs) : null);
      if (e.kind === 'new-rule') snap.set(ownershipPath, read(ownershipPath));
      try {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, e.draft.replace(/\n+$/, '') + '\n');
        if (e.kind === 'new-rule') ensureOwnerRow(ownershipPath, e.tag, e.role);
        gate();
      } catch (err) {
        for (const [p, c] of snap) { if (c === null) { try { require('node:fs').rmSync(p); } catch {} } else writeFileSync(p, c); }
        const msg = (err.stderr ? err.stderr.toString() : '') + (err.message || String(err));
        e.decision = { verdict: 'park' };
        e.applyLog.push(`apply failed ${file.round}: ${msg.slice(0, 500)}`);
        rewrite(entries);
        report.failed.push({ tag: e.tag, reason: msg.split('\n')[0].slice(0, 200) });
        i++; continue;
      }
      report.adopted.push(e.tag);
      done(); continue;
    }
    report.parked.push(e.tag); i++;
  }
  return report;
}

// CLI
import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const triagePath = join(root, '.agentsmith/instruction-review/triage.json');
  apply({ root, triagePath }).then((r) => console.log(JSON.stringify(r, null, 2)));
}
```

> Replace the stray `const base = require;` line — it is a leftover; delete it. Replace the snapshot-restore `require('node:fs').rmSync` with a top-of-file `import { rmSync } from 'node:fs'` and call `rmSync(p, { force: true })`.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/triage-apply.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add devtools/triage-ui/apply.mjs test/triage-apply.test.mjs
git commit -m "$(printf '%s' '🤖 feat(triage-ui): shared apply.mjs engine (write-a-file, not splice)

Usage: model=claude-opus-4-8[1m]
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 3: server — migrate-on-read, `GET /api/rule`, `POST /api/apply`

**Files:**
- Modify: `devtools/triage-ui/server.mjs`
- Test: `test/triage-server.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
test('readTriage and currentToken use the migrated form (no spurious 409)', async () => {
  // write a pre-v2 triage.json (with current + adopt details) to a temp path
  // GET /api/triage -> version V; PUT with version V and a no-op change -> 200, not 409
});

test('GET /api/rule returns live file text and guards traversal', async () => {
  // GET /api/rule?targetFile=instructions/core/swe/swe-x.md -> { text }
  // GET /api/rule?targetFile=../../etc/passwd -> 400
});

test('POST /api/apply takes the lock; PUT during apply -> 423', async () => {
  // hard to time deterministically; assert the lock helper rejects PUT while held
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/triage-server.test.mjs`
Expected: FAIL — endpoints/migration not present.

- [ ] **Step 3: Implement in `devtools/triage-ui/server.mjs`**

- Route `readTriage` and `currentToken` through one helper:

```js
import { migrateWorksheet } from './schema.mjs';
function loadMigrated() {
  const raw = existsSync(triagePath) ? readFileSync(triagePath, 'utf8') : null;
  if (raw === null) return { data: { round: '', entries: [] }, missing: true };
  return { data: migrateWorksheet(JSON.parse(raw)), missing: false };
}
const currentToken = () => { try { return versionToken(canonicalJSON(loadMigrated().data)); } catch { return '__unparseable__'; } };
```
(`readTriage` serves `loadMigrated().data` + that token; the PUT compares against `currentToken()` computed the same way. Never write `triage.json` on boot.)

- `GET /api/rule`:

```js
if (url.pathname === '/api/rule') {
  const tf = url.searchParams.get('targetFile') || '';
  const abs = resolve(REPO_ROOT, tf);
  const instr = resolve(REPO_ROOT, 'instructions') + sep;
  if (!abs.startsWith(instr)) return json(res, 400, { error: 'path outside instructions/' });
  return json(res, 200, existsSync(abs) ? { exists: true, text: readFileSync(abs, 'utf8') } : { exists: false });
}
```

- Apply lock + `POST /api/apply`:

```js
let applying = false;
// in PUT handler, before writing:
if (applying) return json(res, 423, { error: 'applying' });
// route:
if (req.method === 'POST' && url.pathname === '/api/apply') {
  if (applying) return json(res, 423, { error: 'applying' });
  // clean-base preflight
  const dirty = execFileSync('git', ['status', '--porcelain', 'instructions', 'instructions/ownership.yaml'],
    { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  if (dirty) return json(res, 409, { error: 'dirty base', paths: dirty.split('\n') });
  applying = true;
  try {
    const report = await apply({ root: REPO_ROOT, triagePath, runTests: true });
    return json(res, 200, { report, version: currentToken() });
  } finally { applying = false; }
}
```

(`apply` imported from `./apply.mjs`.)

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/triage-server.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add devtools/triage-ui/server.mjs test/triage-server.test.mjs
git commit -m "$(printf '%s' '🤖 feat(triage-ui): /api/rule, /api/apply (lock+preflight), migrate-on-read

Usage: model=claude-opus-4-8[1m]
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 4: front-end — live diff, Apply button, reply panel, adopt/park no note

**Files:**
- Modify: `devtools/triage-ui/app.js`, `index.html`, `style.css`
- Verification: manual (dev tool) + the unit-tested layers below it.

- [ ] **Step 1: Live current via `/api/rule`, cached per entry**

In `app.js` `renderDetail`, fetch the live rule once per selected entry and cache it on the entry object, then pass to `renderDiff`:

```js
async function liveCurrent(e) {
  if (e._live !== undefined) return e._live;
  if (e.kind === 'new-rule') return (e._live = '');
  const r = await (await fetch(`/api/rule?targetFile=${encodeURIComponent(e.targetFile)}`)).json();
  return (e._live = r.exists ? r.text : '');
}
```

Change `renderDiff(entry)` to take the cached `current` string instead of `entry.current`: `lineDiff(curText || '', entry.draft || '')`. Do not fetch inside `renderDiff` (it re-runs per keystroke).

- [ ] **Step 2: Hide the note for adopt/park; render `lastRoundReply` for refine**

When the selected verdict is `adopt` or `park`, hide `detailsBox` + `detailsLabel`; on `applyDecision`, do not write `decision.details` for adopt/park. For a refine entry, render a read-only panel showing `decision.details` (question) and `lastRoundReply` (answer) when present.

- [ ] **Step 3: Apply button + 423 branch**

Add a header **Apply** button → confirm dialog → `POST /api/apply` → render `report` in a panel → re-render from `{version}` in the response. In `save()`, branch on the lock status before the stale-version case:

```js
  else if (res.status === 423) { setSave('applying… retrying', 'err'); setTimeout(save, 1500); }
  else if (res.status === 409) { setSave('changed on disk — reloading', 'err'); await load(); }
```

- [ ] **Step 4: Manual verification**

Run: `npm run triage`; confirm: diff renders from the live file; editing draft re-renders without refetch; adopt/park hide the note; a refine entry shows the reply panel; Apply on a clean base runs and reports; Apply on a dirty `instructions/` is refused with the dirty paths.

- [ ] **Step 5: Commit**

```bash
git add devtools/triage-ui/app.js devtools/triage-ui/index.html devtools/triage-ui/style.css
git commit -m "$(printf '%s' '🤖 feat(triage-ui): live diff, Apply button, refine reply panel

Usage: model=claude-opus-4-8[1m]
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 5: thin `/instruction-apply` skill

**Files:**
- Modify: `tools/claude/commands/instruction-apply.md` (and the SKILL.md Apply-pipeline prose)

- [ ] **Step 1: Replace the guided ensure-end-state prose with the engine call**

Rewrite the Apply pipeline to: read `.agentsmith/instruction-review/triage.json`; if absent/empty report "nothing to apply"; otherwise run `node devtools/triage-ui/apply.mjs` (the shared engine) and report its JSON (adopted/rejected/folded/deferred/refined/parked/skipped/failed), surfacing each refine's `details` + `lastRoundReply`. Note the engine validates, gates on `node --test`, recovers per-entry, and splices atomically — the skill no longer hand-edits files.

- [ ] **Step 2: Verify the export sweep**

Run: `node --test test/triage-export.test.mjs` (apply.mjs lives under `devtools/`, must not ship).
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tools/claude/commands/instruction-apply.md tools/claude/skills/instruction-review/SKILL.md
git commit -m "$(printf '%s' '🤖 docs(instruction-review): thin /instruction-apply onto apply.mjs

Usage: model=claude-opus-4-8[1m]
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Phase 2 done-check

- [ ] `node --test` → all green (schema v2, apply, server, export, plus Phase 1 suite)
- [ ] `npm run triage` → live diff, Apply button (confirm + clean-base + report), refine reply panel, no note on adopt/park
- [ ] `node devtools/triage-ui/apply.mjs` applies a worksheet end-to-end (adopt writes a file, reject writes a log line, splices, gates)
- [ ] pre-v2 worksheet loads without dirtying disk and saves without a spurious 409
- [ ] `git status` clean
