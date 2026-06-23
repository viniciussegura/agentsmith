# Triage scorecard + candidates persistence — Design

**Status:** Approved (hardened via 5-round spec-review; open-blocking 10 → 6 → 7 → 5 → 1 → 0)

## Goal

Make the instruction-review round's two ephemeral outputs — the **dimension scorecard** and the **surfaced-but-undrafted proposals** — first-class, persisted artifacts in `triage.json`, and render both in the triage UI. The human can then inspect the scorecard and triage low-priority/new-rule proposals (which previously vanished into chat) without re-running a round.

## Motivation

Three gaps observed after the 2026-06-18 round:

1. The dimension scorecard lived only in chat — lost on scroll, not inspectable later, and one round forgot to present the matrix at all.
2. ~24 verified proposals were *surfaced but not drafted* (a curation bias toward `strengthen`, which is anchored to an existing rule and cheap to draft; `new-rule`s need whole-cloth authoring and got deferred). They were invisible in the worksheet — the human had no handle to evaluate or request them.
3. No per-lens verdict legibility — a flat prose list, no matrix, no icons.

This converts both outputs into structured data the UI surfaces, with a lightweight **candidate** representation (no draft) that the human can promote to a full drafted entry via `/instruction-apply`.

## Data model

`triage.json` gains two siblings to `entries`. The TypeScript contract:

```ts
type Verdict  = 'strong' | 'good' | 'weak' | 'gaps';   // scorecard cell verdicts
type Priority = 'high' | 'medium' | 'low';

interface TriageFile {
  round: string;
  scorecard: Scorecard | null;   // null when the round ran no reduce (e.g. setup-gate "stop and process")
  candidates: Candidate[];       // undrafted, surfaced proposals; [] when none
  entries: Entry[];              // unchanged from schema v2 (drafted, full triage)
}

interface Scorecard {
  lenses: string[];              // column order for the matrix, e.g. ['swe','security','db','qa','docs','frontend','ux','ai','git']
  perLens: PerLensRow[];         // 3 rows: 'coverage', 'clarity', 'ownership'
  global: GlobalRow[];           // 4 rows: 'cohesiveness', 'self-reference', 'lean-split', 'normative-voice'
  details: Finding[];            // the findings that drove weak/gaps cells (review surface)
  nits: string[];                // mechanical-nits list
}
interface PerLensRow { dimension: string; cells: Cell[]; }   // one cell per lens
interface Cell       { lens: string; verdict: Verdict; }
interface GlobalRow  { dimension: string; verdict: Verdict; }
interface Finding    { dimension: string; lens?: string; file: string; tag: string; note: string; }

interface Candidate {
  tag: string;
  kind: 'new-rule' | 'strengthen' | 'rehome' | 'reowner';
  role: string;
  targetFile: string;
  gap: string;
  priority: Priority;            // assigned by the editor (reduce step)
  decision: { verdict: 'park' | 'wanted' | 'reject'; details?: string };
  // NO `draft`, NO `applyLog` — a candidate is not an entry.
}
```

`Entry` is unchanged (the schema-v2 shape: `{ tag, kind, role, targetFile, status, gap, draft?, proposedFile?, proposedOwner?, decision, applyLog, lastRoundReply? }`).

### Canonical v3 form and the version-token contract (resolves `migrate-v3-version-contract`)

The canonical v3 `TriageFile` **always carries `scorecard` and `candidates` as keys** (defaults `null` and `[]`). `migrateWorksheet` adds them when absent; the serializer never strips them back out. This makes the v3 canonical form deterministic regardless of whether the input was v2 or v3.

The no-spurious-409 guarantee already holds because **every token computation goes through the migrated form**: `server.mjs` `readTriage`/`currentToken` both call `loadMigrated` → `versionToken(canonicalJSON(migrated))`. So GET returns the v3 token and PUT compares against the v3 token — they match. A v2 file on disk has a different (pre-migration) byte form, but its token is never computed un-migrated. The first PUT or apply rewrites it to the v3 canonical form; from then on disk == canonical. `apply.mjs`'s `rewrite` closure must serialize the migrated `file` (which now includes `scorecard`/`candidates`) — see the apply.mjs component.

### Why candidates are separate from entries

An entry always carries a `draft` (its reason to exist is "here is concrete text to adopt"). A candidate is a *pointer to a gap* with no text yet. Forcing candidates into the entry shape would mean empty/placeholder drafts that break the "every entry has a draft" invariant and the adopt gate. Keeping them a distinct, draft-less list is cleaner and makes the promote step explicit.

## Behavior

### Candidate verdicts

| verdict | meaning | who acts | effect |
|---|---|---|---|
| `park` (default) | undecided | — | left in `candidates`; re-surfaces next round |
| `wanted` | "draft this" | `/instruction-apply` **agent** | agent authors a house-style draft, writes it into `triage.json` as a new **entry** (`verdict: park`, `status: ready`, draft filled), and removes the candidate |
| `reject` | "ignore this" | **apply.mjs** (engine) | splice from `candidates` + write one canonical decisions-log line so it does not re-surface |

`wanted` is engine-unwritable (apply.mjs has no model), so the engine only **surfaces** it (a `wanted` bucket in the report) — mirroring how `refine` entries are surfaced for the agent rather than written by the zero-dep engine. The human reviews the agent-authored draft (now a parked entry) and adopts it on a later pass; adoption stays human-gated (#swe-done).

`reject` is mechanical and terminal — symmetric with entry `reject` — so the engine handles it. Resolves `candidate-reject-details-default`: the existing `ensureDecisionLine(path, 'reject', e)` reads `e.decision.details`, so the candidate pass first computes `details = candidate.decision.details?.trim() || 'not pursued'` and calls `ensureDecisionLine` with a `{ tag, decision: { details } }` shape (the reject grammar needs only `tag` + `details`, not `targetFile`/`role`). It appends `` `#tag` -- rejected: <details> `` to `docs/instruction-rules-decisions.md` (idempotent, one line per tag) then splices the candidate.

### Promoting a `wanted` candidate is a single atomic write (resolves `both-lists-momentary-state`, `candidate-wanted-validate-before-write`)

The `/instruction-apply` agent must NOT write the entry and remove the candidate in two steps — a crash between them would leave the tag in both lists, which `validateFile` rejects, bricking the file. Instead the agent: (0) reads `triage.json` after the engine exits and **migrates it** with `migrateWorksheet` (resolves `wanted-promotion-validate-before-write-validateFile-scope` — the base is always the canonical v3 form); (1) authors the house-style draft; (2) builds the promoted **entry** in memory (`kind`/`role`/`targetFile`/`gap` inherited from the candidate; `draft` filled non-empty; `status: {state:'ready'}`; `decision: {verdict:'park'}`; `applyLog: []`); (3) constructs the next file object with the entry **added** and the candidate **removed** in one object; (4) validates it locally with `validateFile` (must be problem-free — e.g. a `new-rule`/`strengthen` entry needs a non-empty `draft`); (5) issues **one** PUT / one atomic write. If validation fails or the PUT 400s, neither mutation persists (the candidate stays `wanted`). Promotion never adopts — the gate that can fail is the later human-driven `adopt`, which keeps the existing per-entry snapshot recovery (re-park + `applyLog`), unchanged by this spec.

**Read ordering + concurrency (resolves `agent-race-on-wanted-promotion`):** the agent builds the promotion base from a read of `triage.json` taken **after `node devtools/triage-ui/apply.mjs` exits** (so it includes any reject-candidate splices the engine just made) — never from a copy read before the engine ran. If the agent goes through the server `PUT /api/triage`, it uses the version token from that post-apply read and, on a `409 stale version` (a concurrent UI edit), it **re-reads and rebuilds** before retrying — the same stale-version protocol the UI's `load()`-on-409 path already uses. Running the UI Apply and `/instruction-apply` against the same worksheet simultaneously is out of scope (single-user dev tool); the version token is the backstop if it happens.

### Scorecard lifecycle

The scorecard is a per-round artifact: each `/instruction-review` round **overwrites** `scorecard`. `/instruction-apply` never touches it. On the setup parked-check gate's "ignore parked" path the whole worksheet (scorecard included) is archived to `triage.prev.json`. A round that runs no reduce (the gate's "stop and process" path) leaves `scorecard` and `candidates` as-is — they are only ever written by a reduce.

**Parked-check "consider parked" merge path (resolves `consider-parked-candidates-fate`):** that path runs a reduce, so it produces a fresh scorecard and fresh candidates. On merge: `scorecard` is **overwritten** with the new round's (the old one described a prior subject and would be stale). `candidates` **merge by tag** with the same precedence the gate already uses for entries — a fresh candidate whose tag is now live (in `node bin/cli.js --stdout`) or in the decisions log is dropped; a fresh candidate whose tag matches an existing **entry** is dropped (the drafted entry wins); a fresh candidate whose tag matches an existing **candidate** replaces it unless that candidate was hand-edited (verdict `wanted`/`reject`), which is preserved; a fresh **entry** whose tag matches an existing **candidate** drops that candidate (the drafted entry wins — it has text; resolves `consider-parked-candidate-entry-overlap-undefined`); old candidates not revisited this round survive.

## Components

### `devtools/triage-ui/schema.mjs`
- **`migrateWorksheet` → v3**: tolerate missing `scorecard` (default `null`) and `candidates` (default `[]`). Idempotent, in-memory on read; v2 files load with no spurious diff. Existing v2 migration (drop stored `current`, strip adopt/park `details`) stays.
- **`validateCandidate(candidate, where)`** (new): required `tag`/`kind`/`role`/`targetFile`/`gap` non-empty; `kind ∈ KINDS`; `priority ∈ ['high','medium','low']`; `decision.verdict ∈ ['park','wanted','reject']`; `details` optional on `reject`, and a **validation error if present on `park`/`wanted`** (same treatment as the entry validator's `adopt`/`park`; resolves `candidate-details-on-park-wanted`); **no `draft` key** (error if present).
- **`validateScorecard(scorecard, where)`** (new): `null` is valid; else `lenses` a string[] (**may be empty** — the UI then renders no matrix, just global/details/nits; resolves `empty-lenses-array-unspecified`, and the §Data model `lenses` type is plain `string[]` to match); every `perLens`/`global` verdict ∈ `['strong','good','weak','gaps']`; `details` items have `file`/`tag`/`note`; `nits` a string[]. **Dimension names are open (resolves `perLens-dimension-names-not-enforced`):** the validator does **not** enforce a fixed dimension name set or cardinality for `perLens`/`global`; the UI labels each row from `row.dimension` (data-driven, not positional), so any names render correctly. The 3+4 lists in §Data model are the editor's convention, not a validator constraint. **Matrix alignment (resolves `scorecard-cell-alignment-unvalidated`):** for every `perLens` row, `cells.length === lenses.length` and `cells[i].lens === lenses[i]` for all `i` — so the UI indexes columns positionally without misalignment or out-of-bounds.
- **`validateFile`**: also validate `scorecard` and each `candidates[]` member; a duplicate tag across `candidates` is a problem; a tag appearing in both `entries` and `candidates` is a problem (one or the other).
- **Leniency on absence (resolves `existing-tests-break-on-validateFile-expansion`):** `validateFile` treats a **missing** `scorecard` as `null` and a **missing** `candidates` as `[]` — it only flags a *present-but-malformed* one. So existing callers/tests that build bare `{ round, entries }` stay valid (the canonical keys are supplied by `migrateWorksheet`, not demanded by the validator). The only existing test that changes is the server `migrate-on-read` test, whose post-migration `deepEqual` expectation gains `scorecard: null` + `candidates: []` (called out in Testing).
- `canonicalJSON`/`versionToken` already key-sort recursively → the new fields fold in automatically (no change).

### `devtools/triage-ui/apply.mjs`
- Read `candidates` (via migrated file). Add to the report: `wanted: string[]` and `ignored: string[]`.
- **Validation already covers candidates (resolves `apply-mjs-validate-candidates-not-called`):** the existing `validateFile(file)` call at the top of `apply()` now validates candidates + scorecard too, so a malformed candidate returns `{ error: 'invalid', problems }` before any processing — the same gate entries get.
- **Early-exit fix (resolves `apply-mjs-nothing-to-apply-gate`):** the current guard returns `{error:'nothing to apply'}` when `entries` is empty. Change it to return only when **both** `entries.length === 0` and `candidates.length === 0` — a file with only `wanted`/`reject` candidates is actionable.
- **`candidates` is a rebindable `let` (resolves `rewrite-closure-candidates-rebind`)**, mirroring the existing `entries` pattern. The `rewrite` closure becomes `() => atomicWrite(triagePath, canonicalJSON({ ...file, entries, candidates }))` so a candidate splice persists. (`file` is the migrated object, so `scorecard` and the rest ride along — also satisfies the `migrate-v3-version-contract` rewrite requirement.)
- New pass over `candidates` (after the entries loop):
  - `wanted` → `report.wanted.push(tag)`; leave in place (the agent drafts + removes it atomically; see the promotion section).
  - `reject` → compute `details = c.decision.details?.trim() || 'not pursued'`, call `ensureDecisionLine(decisionsPath, 'reject', { tag: c.tag, decision: { details } })` inside a **per-candidate try/catch** (mirroring the entry reject's try/catch structure, isolating one failing candidate from the rest), then rebind `candidates = candidates.filter(x => x !== c)` and `rewrite()`; `report.ignored.push(tag)`. On a decisions-log write failure (the `catch`), push to `failed` and leave the candidate (recoverable on re-run) — symmetric with entry reject. (resolves `ensure-decision-line-candidate-shape`)
  - `park`/none → leave.
- **`onProgress` candidate events (resolves `onProgress-candidate-phase-total-undefined`, `onprogress-start-total-semantics`):** entry events keep their shape (`{type:'entry', phase, i, total, tag, verdict, outcome}`). The `{type:'start', total}` event is **unchanged** — `total` stays `entries.length` (the entry-phase count); candidates are not banner-counted. Candidate events use a **distinct type** — `{type:'candidate', tag, outcome:'wanted'|'ignored'|'parked'}` — with no `i`/`total`/`phase`. Both handlers gain a `type==='candidate'` branch: server → `console.log('[apply] candidate #'+tag+' -> '+outcome)`; CLI → `process.stderr.write('  candidate #'+tag+' -> '+outcome+'\n')`. The existing `type==='entry'` and `type==='start'` formatting (incl. the "N entries…" banner) is untouched and stays accurate.
- The entries loop is unchanged.

### `devtools/triage-ui/server.mjs`
- `PUT /api/triage` already validates via `validateFile` → now also enforces the candidate/scorecard rules (no endpoint change).
- `POST /api/apply` report now includes `wanted`/`ignored`. **`commitApply` (resolves `commitapply-ignored-bucket`):** add `'ignored'` to the `committable` key list so (a) the "did anything change" count includes rejected candidates (they wrote a decisions-log line) and (b) the commit summary + tag list name them. The staged set is unchanged (`git add instructions docs/instruction-rules-decisions.md` already covers the decisions-log write; `triage.json` is gitignored). `wanted` is **not** in `committable` (no committed-file change). The commit **message body** is reworded so it is accurate for an `ignored`-only commit (no adopts): replace "each adopt gated on node --test" with "adopts gated on node --test" (resolves `commitapply-start-event-log-stale`). `wanted` candidates are reported back so the UI can hint "run /instruction-apply to draft N".

### `devtools/triage-ui/app.js` + `index.html` + `style.css`
- **State normalization (resolves `ui-state-shape-candidates-absent`):** after `load()`, before any render, default `state.data.candidates = state.data.candidates ?? []` and `state.data.scorecard = state.data.scorecard ?? null`, so a pre-v3 GET (or any file the server returns without the keys) can't crash sidebar/scorecard iteration. (`state` init also gains `candidates: []`, `scorecard: null`.)
- **Scorecard panel** (collapsible, above the entry sidebar or as a toggled view): render `perLens` as a matrix — one row per `perLens` entry (label = `row.dimension`, data-driven), columns = `scorecard.lenses` (in array order), each cell a verdict icon (🟢 strong · 🔵 good · 🟡 weak · 🔴 gaps); the `global` rows as a short labelled list below (each `row.dimension` + icon); then `details` rendered as a **flat list** (each: `dimension` · optional `lens` · `file` · `#tag` · `note`; resolves `global-row-lens-field-contradiction` — no grouping, no scope discriminator needed) and `nits`. Hidden when `scorecard` is null; when `lenses` is empty, the matrix is omitted and only global/details/nits render.
- **Candidates** in the sidebar under a divider, sorted by priority (high→low) then **lexicographically by tag (case-insensitive)** (resolves `candidate-priority-sort-tie-break-unspecified`): each row shows the tag, a priority chip, and a **`<select>` verdict control** with options `park`/`wanted`/`reject` (resolves `debounced-put-control-type` — a `<select>`, not a radio group, so it never collides with the entry detail's `name="verdict"` radios) that sets `candidate.decision.verdict` and saves via the existing debounced+serialized PUT (the `saving`/`pendingSave` guard already prevents stale-version races). Reject may take an optional reason. No diff/editor (no draft).
- The apply report panel lists `wanted`/`ignored`.

### `/instruction-apply` skill (both trees: `tools/claude/commands/instruction-apply.md` source → `.claude/...` generated)
- After running `node devtools/triage-ui/apply.mjs`, the skill (agent) reads the report's `wanted` list and, for each, performs the **single-atomic-write promotion** defined in "Promoting a `wanted` candidate" above (author draft → build entry → add entry + remove candidate in one object → validate locally → one write). It surfaces `wanted`/`ignored` alongside the existing buckets in its report.

### `/instruction-review` skill + `instruction-editor` agent (both trees)
- **Editor output contract (resolves `skill-editor-output-contract`):** `instruction-editor.md`'s Output section must change from "return the consolidated proposal set projected onto the entry schema" to **return `{ scorecard, candidates, entries }`** — the scorecard in the matrix form of §"Data model", `candidates[]` = every verified-but-undrafted proposal (with an assigned `priority`), `entries[]` = the drafted ones. The verify step still gates what reaches either list.
- **Worksheet shape (resolves `skill-md-worksheet-shape-stale`):** SKILL.md step 5 currently documents the worksheet as `{ round, entries[] }`. Update it in **both trees** to `{ round, scorecard, candidates, entries }`, and state that the skill writes all three (was: entries only; scorecard only in chat). The chat scorecard table is still presented.
- **`proposal-format.md` (both trees):** add the persisted `Scorecard` and `Candidate` TypeScript shapes from §"Data model" and document the `park`/`wanted`/`reject` candidate flow (who acts on each, per the verdict table).
- Source of truth is `tools/claude/**`; `.claude/**` is regenerated by `node bin/cli.js`. Edits go to `tools/claude/**` (and the dev-only `.claude/agents/instruction-editor.md` is also regenerated from there). Plan tasks must edit the `tools/claude` copies, then regenerate.

## Data flow

```
/instruction-review (reduce) ──writes──> triage.json { scorecard, candidates, entries }
                                              │
                          ┌───────────────────┴───────────────────┐
                          ▼                                         ▼
                  triage UI (inspect)                       /instruction-apply
            scorecard matrix + candidate                  - entries: adopt/reject/... (as today)
            verdict toggles (park/wanted/reject)          - candidates reject: engine logs + splices
                          │ PUT                            - candidates wanted: agent drafts -> parked entry
                          ▼
                     triage.json
```

## Error handling

- A malformed candidate or scorecard is **reported and skipped/refused** by `validateFile` (PUT → 400; apply → `{error:'invalid', problems}`), never half-applied — same contract as entries.
- A `reject` candidate whose decisions-log write fails is reported in `failed` and left in `candidates` (not spliced) — recoverable on re-run. This includes the `ensureDecisionLine` throw when the log has no `## Rejected` section (same fragility entries already have); the candidate pass wraps the call in the same try/catch the entry reject path uses.
- Migration of a pre-v3 file never writes to disk on read (migrate-on-read); the file changes only via PUT/apply, as today.

## Testing

- **schema**:
  - migrate v3 idempotent (migrate(migrate(x)) == migrate(x)); v2→v3 adds `scorecard:null`+`candidates:[]`; the **token of the migrated v2 file equals the token after a PUT** (encodes `migrate-v3-version-contract`). Existing-test impact verified (resolves `bare-round-entries-tests-deepEqual-claim`): the schema migrate test (`assert.deepEqual(migrateWorksheet(m), m)`) compares two migrated forms → stays green; the server migrate-on-read test asserts specific fields + a PUT round-trip, not a full `deepEqual` of the migrated object → stays green. **No existing test full-deepEquals a bare `{round,entries}` against the migrated output, so no existing test needs editing.**
  - `validateCandidate` accept + reject cases: bad `priority`, bad `verdict`, stray `draft` key, missing required field.
  - `validateScorecard`: `null` ok; bad verdict rejected; **matrix-misalignment rejected** — `cells.length !== lenses.length` and `cells[i].lens !== lenses[i]` (encodes `scorecard-cell-alignment-unvalidated`).
  - `validateFile` cross-checks: duplicate candidate tag; same tag in both `entries` and `candidates`.
- **apply**:
  - `wanted` candidate → surfaced in `report.wanted`, candidate left in place, no decisions-log write.
  - `reject` candidate → `report.ignored`, decisions-log line written with `details` (and `'not pursued'` default when absent), candidate spliced, rewrite carries `candidates`.
  - **empty-entries-but-candidates file is processed, not short-circuited** (encodes `apply-mjs-nothing-to-apply-gate`); the `!existsSync(triagePath)` file-missing guard is unchanged (a missing file trivially satisfies both-empty).
  - `park` candidate untouched; entries loop still green; `onProgress` emits a `candidate` phase.
- **server**: PUT round-trips a file carrying scorecard + candidates; GET token == PUT token (no spurious 409) for a v2 file migrated to v3; `commitApply` "did anything change" returns true for an `ignored`-only report and false for a `wanted`-only report (encodes `commitapply-ignored-bucket`). All existing schema/server tests stay green unchanged (per the leniency rule + the deepEqual analysis above).
- **UI** (non-automated, manual smoke noted): pre-v3 GET (no `candidates`/`scorecard` keys) renders without crashing (encodes `ui-state-shape-candidates-absent`); candidate `<select>` does not collide with the entry verdict radios.
- **diff**: unaffected by data-model change (diff tests already green).
- Full `node --test` green; `node bin/cli.js` regenerates both skill trees (and the generated `.claude/**`).

## Implementation notes (for the plan)

The doc/skill edits have no unit test (content, not behavior), so the plan **must** enumerate them as explicit tasks, each editing the `tools/claude/**` source then regenerating:
- `tools/claude/agents/instruction-editor.md` — Output section → return `{ scorecard, candidates, entries }`.
- `tools/claude/skills/instruction-review/SKILL.md` — step 5 worksheet shape → `{ round, scorecard, candidates, entries }`, **and** step 1 "Consider parked" gate → add the candidate-merge + scorecard-overwrite rules from §"Scorecard lifecycle" (resolves `consider-parked-skill-update-gap`; without this the gate prose stays silent on candidates).
- `tools/claude/skills/instruction-review/proposal-format.md` — add the `Scorecard`/`Candidate` shapes + the `park`/`wanted`/`reject` flow.
- `tools/claude/commands/instruction-apply.md` — (a) add the wanted-promotion atomic-write step; (b) **remove/qualify the existing "does not hand-edit files itself" statement** — the `wanted` promotion is the explicit exception where the agent (not the engine) writes `triage.json` directly, one atomic write per promoted candidate, processed sequentially, reading from `.agentsmith/instruction-review/triage.json` after the engine exits (resolves `wanted-promotion-agent-hand-edit-contradiction`); (c) update the early-exit prose from "absent or has no entries" → "absent or has no entries **and** no candidates" (resolves `instruction-apply-command-early-exit-prose`).
Verification for these is the regeneration (`node bin/cli.js` writes the `.claude/**` copies) + a manual read; no assertion beyond "the strings are present."

## Out of scope (YAGNI)

- Inline AI drafting in the server (no model access; that is the agent's job in `/instruction-apply`).
- Auto-adopting agent-authored drafts (human reviews the parked entry first).
- Editing the scorecard in the UI (it is a read-only round artifact).
- Per-cell drill-down beyond the `details` list.
