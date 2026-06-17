# Spec: JSON triage worksheet + local triage UI

Status: Approved

A two-phase change to the instruction-review triage flow. **Phase 1** replaces the markdown triage worksheet (`triage.md`, grammar pinned across [v1](../2026-06-16-instruction-triage-worksheet/spec.md)/[v2](../2026-06-16-triage-worksheet-v2/spec.md)/[v3](../2026-06-17-triage-worksheet-v3/spec.md)) with a structured `triage.json`, and migrates `/instruction-review` (emit) and `/instruction-apply` (consume) to it. **Phase 2** adds a zero-dependency, dev-only local web UI for triaging that file. Phase 1 is the shippable, behavior-parity-critical milestone (the JSON is hand-editable, no UI needed); Phase 2 is additive dev tooling on its schema. **The two phases become two plans under this one spec** (so the schema is pinned once); Phase 1 ACs (1-7) gate the milestone, Phase 2 ACs (8-11) are independent.

## Problem

Triaging is N independent human judgments over a worksheet. The markdown worksheet was chosen for hand-editability **in the absence of a tool**, which forced a hard-won parse contract (bare markers, fenced blocks, a checkbox grammar, a `<!-- apply-log -->` sentinel, a first-non-blank-line `#tag` fold rule). It is still clumsy to review: no real diff between the current rule and the proposal, no overview of the set, no validation (a fold target can be a non-existent tag), and editing a multi-line draft in a flat file is awkward.

The fix has two halves that compose:

1. **Make the worksheet data, not a document.** Once a UI exists, hand-editability of *markdown* is no longer the priority, so a structured `triage.json` is strictly better: native `JSON.parse` (the repo is **zero-dependency** by policy -- it hand-rolls even its YAML reader), no round-trip-fidelity risk, schema validation, and the entire markdown parse contract is **retired**. Decision parameters become typed fields instead of text parsed out of a blob.
2. **Give triage a real surface.** A local web UI: navigate the set, see a current→draft diff, pick a decision, fill the one field that decision needs, edit the draft, autosave.

## Schema (`triage.json`)

Per `#swe-entity`, the contract is TypeScript, with discriminated unions so each kind's required fields and each verdict/status's required params are structurally enforced (illegal states unrepresentable). Structural typing cannot express **cross-reference resolvability** (a `foldTarget` naming a live `#tag`, a resolvable `proposedOwner`); those are validated by apply (see "Apply contract").

```typescript
type Kind = 'new-rule' | 'strengthen' | 'rehome' | 'reowner';
type Verdict = 'park' | 'adopt' | 'reject' | 'fold' | 'defer' | 'refine';

// Proposal readiness, carried verbatim from the review (NOT the human's verdict).
// Discriminated on `state`; the dependency is required on the two non-ready states.
type Status =
  | { state: 'ready' }
  | { state: 'blocked'; blockedOn: string }        // a #tag this waits on
  | { state: 'conditional'; blockedOn: string };   // the condition that must hold

// The human triage decision: verdict + the one param that verdict needs.
type Decision =
  | { verdict: 'park';   details?: string }        // default; details = optional musing
  | { verdict: 'adopt';  details?: string }
  | { verdict: 'reject'; details: string }         // reason required
  | { verdict: 'fold';   foldTarget: string; details: string }  // target #tag AND reason required
  | { verdict: 'defer';  details: string }         // condition required
  | { verdict: 'refine'; details: string };        // input required

interface EntryBase {
  tag: string;
  role: string;
  targetFile: string;     // where the rule lives / belongs (all kinds)
  status: Status;
  gap: string;            // the gap/problem; the proposal's one-line `rationale` is folded in here
  decision: Decision;     // defaults to { verdict: 'park' }
  applyLog: string[];     // apply's failure records (replaces the v2 sentinel); empty until a failed adopt
}

interface NewRuleEntry    extends EntryBase { kind: 'new-rule';   draft: string }                 // no `current`
interface StrengthenEntry extends EntryBase { kind: 'strengthen'; current: string; draft: string }
interface RehomeEntry     extends EntryBase { kind: 'rehome';     proposedFile: string; current?: string; draft?: string }
interface ReownerEntry    extends EntryBase { kind: 'reowner';    proposedOwner: string }

type Entry = NewRuleEntry | StrengthenEntry | RehomeEntry | ReownerEntry;

interface TriageFile {
  round: string;          // round id, e.g. "2026-06-17"
  entries: Entry[];
}
```

- `current`/`draft` presence mirrors v3: strengthen has both; new-rule has `draft` only; rehome/reowner only when the move also changes text.
- **`status` vs `defer` are orthogonal.** `status` is the proposal's readiness from the review (a `blocked`/`conditional` proposal is not yet actionable). `decision.verdict='defer'` is the human choosing to defer; its condition is `decision.details`, **never** `status.blockedOn`. The deferred decisions-log line draws its condition from `decision.details`. `adopt` requires `status.state === 'ready'` (carried from v1 §3.2); a `blocked`/`conditional` entry cannot be adopted until re-emitted ready.
- `rationale` from the source `InstructionProposal` is **intentionally folded into `gap`** (both are one-line context); it is not a separate field. This governs **emit** (instruction-editor); the one-time migration copies the existing `gap` verbatim, since the markdown worksheet never stored a separate rationale.
- The human may **edit `status.state`** (e.g. flip a resolved `blocked`/`conditional` to `ready`) by hand or in the UI; it is an ordinary field.

## Apply contract (the v1/v2/v3 pipeline, restated against the JSON schema)

Phase 1 must preserve `/instruction-apply` behavior. The mechanics below replace the markdown parse but keep the outcomes; each maps a v1/v2/v3 rule onto the typed schema.

- **A1 validate** becomes `JSON.parse` + schema validation (no markers/fences/checkbox/sentinel). A file that is not valid JSON, or an entry violating the schema (wrong/missing required field per kind; `blocked`/`conditional` without `blockedOn`; `reject`/`defer`/`refine`/`fold` without `details`; `fold` without `foldTarget`), is **malformed: reported and skipped**, never half-applied. Cross-reference checks also run here: `fold.foldTarget` must resolve to a **live `#tag`**; `reowner.proposedOwner` must be a resolvable owner (declared role / `swe` base lens / known non-review marker); `adopt` requires `status.state==='ready'` and the kind's content field (`new-rule`/`strengthen` a non-empty `draft`; `rehome` a `proposedFile`).
- **A3 process** -- per `decision.verdict`, the **same declarative ensure-end-state** edits as v3 (new-rule add-iff-absent; strengthen whole-section replace by the `^## #<tag> -> next ## / EOF` delimiter, which is unchanged and independent of worksheet format; rehome ensure-present/ensure-absent; reowner ownership.yaml row). `reject`/`fold`/`defer` write the decisions-log line. `current` is **never read by apply** (v3 invariant). `refine` writes nothing.
- **Decisions-log parity** -- apply **generates** each line in the canonical *grammar* of `docs/instruction-rules-decisions.md`, tag backtick-wrapped, every line beginning `` `#tag` -- ``, the reason from `decision.details`:
  - `` `#tag` -- rejected: <details> ``
  - `` `#tag` -- folded into `<foldTarget>`: <details> `` -- `foldTarget` is a pure `#tag` (backtick-wrapped); `details` is the bare reason.
  - `` `#tag` -- deferred: <details> (-> <basename(targetFile)>, <role>) `` -- the hint uses the file **basename** (e.g. `swe.md`) and `role` from `EntryBase`. Basename collisions across dirs are tolerated (the canonical log is itself basename-only).
  One line per tag, updated in place. This is the **same line apply generates today** -- the typed model changes the *source* of the text (typed fields vs `decisionText`), not the grammar. Pre-existing **editorial enrichment** some live lines carry -- a trailing description sentence after the hint, or a sub-locator like `` `#swe-done` item 5 `` -- is human-added in the log, was never machine-generated by any triage pipeline, and is **out of scope**: apply neither synthesizes nor is required to reproduce it (parity is with the generated grammar, not with hand-edited prose).
- **Per-entry removal + crash-resume.** On each successful **terminal** verdict (`adopt`/`reject`/`fold`/`defer`), the entry is spliced from `entries[]` and the **whole array is rewritten atomically** (temp file + rename), so `triage.json` always holds exactly the not-yet-applied entries; a crash resumes by re-running (already-removed entries are gone; ensure-end-state makes any re-touch a no-op). The rewrite re-emits the parsed survivors via the canonical serializer, so each surviving entry is **semantically unchanged (deep-equal after re-parse)** -- only the spliced entry is removed; applying entry A never alters the *field values* of a `park` entry B the human is mid-editing (byte layout normalizes to the canonical form, but no field changes). `park` and `refine` entries are **kept** (never spliced); a re-parked failure is kept too.
- **Failure handler** -- on an adopt's `npm test` failure (or any error): restore the per-entry file snapshots (never file-wide), set the entry's `decision` to `{ verdict: 'park' }`, push the failure string to `entry.applyLog`, and continue. A re-attempt requires a deliberate human re-decision (re-tick to adopt). Recovery stays per-entry (many rules share `core/swe.md`).
- **Report** -- adopted / rejected / folded / deferred / refined / parked / failed, identical buckets to v3.

## Setup gate (the parked-check gate, restated)

`/instruction-review`'s setup gate (SKILL.md step 2) reads `triage.json` if present and computes:

- **`N`** = total entries; **`K`** = entries with `decision.verdict ∈ {adopt, reject, fold, defer}` (a terminal not yet applied). `park` and **`refine` are excluded from `K`** (refine is reported separately, as in v3).
- Offers **(i) ignore all parked / (ii) consider all parked / (iii) stop and process**. *Consider* merges this round's fresh proposals additively, deduped in JSON terms: a fresh proposal whose tag is already **live in `node bin/cli.js --stdout`** or recorded in the **decisions log** is dropped; an indeterminate one is kept. A fresh proposal whose tag matches an existing `triage.json` entry is dropped (the existing, possibly hand-edited, entry wins) -- **except** it **replaces** an entry that is **untouched and still blocked**: `verdict === 'park'` with **empty `details`** and `status.state !== 'ready'`, letting a now-resolved block re-enter as `ready`. A `park` entry carrying human `details` (a musing) counts as hand-edited and **wins** -- never overwritten. *Stop* archives the current `triage.json` to `triage.prev.json` and runs no reduce.

## Architecture & components (Phase 2)

```
instruction-review reduce ──emits──▶ triage.json
                                        │  ▲
                              GET load  │  │ PUT save (atomic, version-checked)
                                        ▼  │
                                   Local web UI  (sidebar list + detail)
                                        │
                              you run   ▼
                                  /instruction-apply ──reads JSON──▶ instructions/
```

- **Location: `devtools/triage-ui/`** -- a new top-level dir. The generator installs only `tools/<ai>/**` -> `.<ai>/**` (`src/tools.js` `planToolInstall` matches `^tools/<ai>/`), and `package.json` `files` lists `tools/` not `devtools/`, so this is **never generated into `.claude/**` and never in `npm pack`**.
- **`server.mjs`** -- Node built-in `http`, zero deps. Routes: `GET /` + static assets (a small hardcoded MIME map for `.html`/`.js`/`.css`/`.json`); `GET /api/triage` returns `{ data, version }`; `PUT /api/triage` validates, checks `version`, writes (temp + rename), returns the new `version`. **Version token** = `sha256` (`crypto`, a Node built-in -- zero *dependency*) over the **canonical serialization of the parsed content** (not the raw bytes): parse the file, then hash `canonicalJSON(parsed)`. `canonicalJSON` = `JSON.stringify` with **sorted object keys** (2-space indent). The UI server writes with it; `/instruction-apply` (an agent, not a guaranteed `JSON.stringify` call) **should** emit the same form, but correctness does not depend on it -- the server re-parses and re-canonicalizes on the next read before hashing, so non-canonical bytes from apply self-heal. Hashing the canonical form (rather than raw bytes) means a reformat / key-reorder by either writer does **not** spuriously change the token, while any **content** change does -- including a same-length, same-mtime autosave (`<mtimeMs>-<size>` missed exactly that case) and an out-of-band `/instruction-apply` mutation. A `PUT` whose `version` != the file's current token is **rejected**; the UI then reloads. (The server always recomputes the token from disk, never from its in-memory object, so load and the next save never disagree.) Best-effort browser open is a platform-branched `child_process` spawn (`cmd /c start ""` on Windows; `open`/`xdg-open` elsewhere) -- no dependency.
- **`index.html` + `app.js` + `style.css`** -- vanilla, no framework, no build step.
- **`diff.mjs`** -- a small hand-rolled LCS line-diff producing red/green rows (~80 LOC; no dependency). Reused by the UI; unit-tested.
- **Launch: `npm run triage`** -- starts the server, prints the localhost URL.

`/instruction-apply` remains an **agent skill**, not callable code; the UI's responsibility ends at writing `triage.json`. The human runs `/instruction-apply` in Claude Code.

## UI behavior (layout: list + detail)

- **Sidebar** -- every entry with a verdict badge (park/adopt/reject/fold/defer/refine) and a decided/total counter; click to focus; current entry highlighted.
- **Detail pane** -- read-only metadata (tag, kind, role, targetFile, status) -> `gap` -> **side-by-side current | draft diff** (red/green); the **draft pane is editable** with live re-diff -> **decision** (six choices incl. park) -> the **field(s)** the chosen verdict needs (`fold` -> a `#tag` dropdown of existing tags **and** a reason; `reject`/`defer`/`refine` -> `details` text) -> autosave.
- **Persistence** -- autosave, debounced, version-checked; the file is the state. No save button.
- New-rule shows only the draft (no current side). Rehome/reowner without text change show metadata + proposed location/owner, no diff.

## Migration (Phase 1, one-time)

The live `.agentsmith/instruction-review/triage.md` was already v3-migrated, so it **already carries `current:` blocks** on its 23 strengthen entries. Migration therefore **copies** those `current:`/`draft:` bodies and metadata into the schema (no re-extraction from source, no tag-not-found case):

- Currently 23 strengthen (each with `current`) + 9 new-rule = 32, **all park, all ready** -- but the migration **asserts the counts it actually parses** rather than hardcoding the split (so a stale assumption fails loudly). Per entry: `decision` -> `{ verdict: 'park' }` (none ticked); `applyLog` -> `[]`; `status` -> `{ state: 'ready' }`; `gap` carried verbatim.
- The migration logic lives in a **tested function** (`devtools/triage-ui/migrate.mjs` or a Phase-1 module) with a unit test over 1-2 representative markdown entries -> expected JSON; the full 32-entry conversion is a one-off invocation. `triage.md` is then removed (replaced by `triage.json`).

## What this replaces / retires

- The markdown worksheet and its **entire parse contract** (v1 §1.2 grammar; v2 checkbox + bare-marker + sentinel; v3 `current:` marker). The strengthen-replace `^## #<tag>` extraction survives in apply (independent of worksheet format). The v1-v3 specs remain as history.
- Free-text `decisionText` + sentinel + first-line-`#tag` fold rule -> typed `Decision` fields + `applyLog[]`.

## Phase 1 prose edits (plan scope)

- `tools/claude/skills/instruction-review/SKILL.md`: step-5 "Worksheet format" (rewrite to describe emitting `triage.json` per the schema, not the markdown entry shape); Apply pipeline A1 (JSON.parse + schema/cross-ref validation, replacing the marker/fence/checkbox grammar); A3/A4 (read typed `decision`, JSON per-entry splice + atomic rewrite, failure→park+applyLog); the setup gate's `N`/`K` rule.
- `tools/claude/skills/instruction-review/proposal-format.md`: replace the worksheet-grammar + decisions-log-driver prose with the JSON schema + typed-field driver.
- `tools/claude/agents/instruction-editor.md`: emit entries to the JSON schema (still carrying the verbatim `current` for strengthen).
- `tools/claude/commands/instruction-review.md` + `instruction-apply.md`: update worksheet references (`triage.json`, typed decisions).

## Error handling

- Missing/empty/invalid `triage.json` -> UI shows an empty state ("run `/instruction-review`"); the server never overwrites an unparseable file.
- **Save conflict** -- the version-token check (above) rejects a stale `PUT`; the UI reloads. This covers both a re-run round and an out-of-band `/instruction-apply` mutation while the UI is open (both change the file token).
- **Schema-tolerant load** -- a missing optional field defaults; an invalid required field surfaces as a per-entry warning rather than crashing the page.
- Atomic write (temp + rename) so a crash mid-save cannot corrupt the file.

## Testing

- **Phase 1:** schema-validation unit tests (each kind's required fields; each verdict/status param; cross-ref resolvability stubs); apply reads typed fields and produces the v3 outcomes incl. decisions-log lines in the canonical grammar (per AC3; editorial prose out of scope) and the per-entry splice/crash-resume; migration unit test (representative markdown -> expected JSON); `npm test` stays green (currently 88/88).
- **Phase 2:** `diff.mjs` unit tests (add/remove/change/identical); server load/save round-trip + atomic-write + stale-version-reject tests; an **export test** asserting `npm pack --dry-run --json` output contains no `devtools/` path and a `node bin/cli.js` run produces no `.claude/**/triage-ui` file. Front-end interaction verified manually (dev tool).

## Acceptance criteria

**Phase 1 (shippable milestone):**
1. `triage.json` validates against the schema; each kind has its required fields, each verdict/status its required params; structurally-illegal entries and unresolvable cross-refs (`foldTarget` not a live tag, unresolvable `proposedOwner`) are rejected by A1.
2. `/instruction-apply` reads `triage.json` and produces the **same** adopt/reject/fold/defer/refine/park outcomes as the markdown pipeline, params from typed `Decision` fields.
3. Apply renders decisions-log lines in the **canonical format** of `docs/instruction-rules-decisions.md` from typed fields: backtick-wrapped `` `#tag` -- ``; `rejected: <details>` / `folded into `<foldTarget>`: <details>` / `deferred: <details> (-> <basename(targetFile)>, <role>)`; one line per tag, updated in place.
4. After each successful terminal verdict the entry is spliced and the array atomically rewritten; `park`/`refine`/re-parked entries remain; a re-run is a no-op (crash-resume parity).
5. An adopt whose `npm test` fails restores per-entry snapshots, sets that entry to `{ verdict: 'park' }`, appends to `applyLog`, and continues; the rest still apply.
6. `adopt` is refused unless `status.state==='ready'`; the setup gate's `K` counts only `{adopt,reject,fold,defer}` (refine/park excluded) and offers ignore/consider/stop with `triage.prev.json` archive on stop.
7. The live worksheet migrates to `triage.json` (32 entries, every `decision={verdict:'park'}`, strengthen entries carrying `current`, `status={state:'ready'}`); `npm test` green; the migration function has a passing unit test.

**Phase 2 (UI, independent):**
8. `npm run triage` starts a localhost server with **no new dependency** in `package.json`; the UI lists all entries, shows a current→draft diff, edits draft + decision + the verdict's field(s), and autosaves valid JSON.
9. A `PUT` carrying a stale version token is rejected (token = a content hash, so a same-length / same-mtime edit still conflicts); an unparseable `triage.json` is never overwritten; a write is atomic (temp + rename).
10. `devtools/triage-ui/` is absent from `node bin/cli.js` output (`.claude/**`) and from `npm pack --dry-run` output (verified by tests).
11. `diff.mjs` produces correct red/green line classification for add/remove/change/identical cases.

## Out of scope

- Running `/instruction-apply` from the UI (apply stays an agent skill).
- Multi-user / remote access / auth (localhost dev tool).
- A rendered unified diff in the terminal (the UI is the diff surface).
- Any change to the review-board (code review) flow.
