# Triage scorecard + candidates persistence — Design

**Status:** Draft

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

`reject` is mechanical and terminal — symmetric with entry `reject` — so the engine handles it: it appends `` `#tag` -- rejected: <details or "not pursued"> `` to `docs/instruction-rules-decisions.md` (idempotent, one line per tag) and splices the candidate.

### Scorecard lifecycle

The scorecard is a per-round artifact: each `/instruction-review` round **overwrites** `scorecard`. `/instruction-apply` never touches it. On the setup parked-check gate's "ignore parked" path the whole worksheet (scorecard included) is archived to `triage.prev.json`. A round that runs no reduce (the gate's "stop and process" path) leaves `scorecard` as-is — it is only ever written by a reduce.

## Components

### `devtools/triage-ui/schema.mjs`
- **`migrateWorksheet` → v3**: tolerate missing `scorecard` (default `null`) and `candidates` (default `[]`). Idempotent, in-memory on read; v2 files load with no spurious diff. Existing v2 migration (drop stored `current`, strip adopt/park `details`) stays.
- **`validateCandidate(candidate, where)`** (new): required `tag`/`kind`/`role`/`targetFile`/`gap` non-empty; `kind ∈ KINDS`; `priority ∈ ['high','medium','low']`; `decision.verdict ∈ ['park','wanted','reject']`; `details` required-absent except optional on `reject`; **no `draft` key** (reject with an explicit message if present).
- **`validateScorecard(scorecard, where)`** (new): `null` is valid; else `lenses` a string[]; every `perLens`/`global` verdict ∈ `['strong','good','weak','gaps']`; `details` items have `file`/`tag`/`note`; `nits` a string[].
- **`validateFile`**: also validate `scorecard` and each `candidates[]` member; a duplicate tag across `candidates` is a problem; a tag appearing in both `entries` and `candidates` is a problem (one or the other).
- `canonicalJSON`/`versionToken` already key-sort recursively → the new fields fold in automatically (no change).

### `devtools/triage-ui/apply.mjs`
- Read `candidates` (via migrated file). Add to the report: `wanted: string[]` and `ignored: string[]`.
- New pass over `candidates` (after the entries loop):
  - `wanted` → `report.wanted.push(tag)`; leave in place (agent will draft + remove).
  - `reject` → `ensureDecisionLine` (reject grammar; details default `"not pursued"`) then splice from `candidates`; `report.ignored.push(tag)`; atomic rewrite.
  - `park`/none → leave.
- `onProgress` emits for candidate processing too (`phase:'candidate'`).
- The entries loop is unchanged.

### `devtools/triage-ui/server.mjs`
- `PUT /api/triage` already validates via `validateFile` → now also enforces the candidate/scorecard rules (no endpoint change).
- `POST /api/apply` report now includes `wanted`/`ignored`; the auto-commit's "did anything change" check counts `ignored` (a decisions-log write) but **not** `wanted` (no file change). `wanted` candidates are reported back so the UI can hint "run /instruction-apply to draft N".

### `devtools/triage-ui/app.js` + `index.html` + `style.css`
- **Scorecard panel** (collapsible, above the entry sidebar or as a toggled view): render `perLens` as a matrix — rows = the 3 per-lens dimensions, columns = `scorecard.lenses`, each cell a verdict icon (🟢 strong · 🔵 good · 🟡 weak · 🔴 gaps); the 4 `global` dims as a short list below; then `details` (file · `#tag` · note) and `nits`. Hidden when `scorecard` is null.
- **Candidates** in the sidebar under a divider, sorted by priority (high→low then tag): each row shows the tag, a priority chip, and a 3-way verdict control (`park`/`wanted`/`reject`) that sets `candidate.decision.verdict` and saves via the existing debounced PUT. Reject may take an optional reason. No diff/editor (no draft).
- The apply report panel lists `wanted`/`ignored`.

### `/instruction-apply` skill (both trees: `tools/claude/...` source, `.claude/...` generated)
- After running `node devtools/triage-ui/apply.mjs`, the skill (agent) reads the report's `wanted` list and, for each, authors a house-style draft (#code-markdown), writes it into `triage.json` as a new entry (`verdict: park`, `status: ready`), and removes the candidate. Then reports.

### `/instruction-review` skill + `instruction-editor` agent (both trees)
- The reduce step now returns scorecard (matrix form) + entries + **candidates** (every verified-but-undrafted proposal, each with an assigned `priority`). The skill **writes scorecard + candidates + entries** into `triage.json` via the canonical serializer (was: entries only; scorecard only in chat). The chat scorecard table is still presented.
- `proposal-format.md` documents the persisted scorecard/candidate shapes and the `wanted`/`reject` candidate flow.

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
- A `reject` candidate whose decisions-log write fails is reported in `failed` and left in `candidates` (not spliced) — recoverable on re-run.
- Migration of a pre-v3 file never writes to disk on read (migrate-on-read); the file changes only via PUT/apply, as today.

## Testing

- **schema**: migrate v3 idempotent + v2→v3 (missing fields default, no spurious version drift); `validateCandidate` accept/reject cases (bad priority, bad verdict, stray `draft`); `validateScorecard` (null ok, bad verdict, matrix shape); `validateFile` cross-checks (dup candidate tag, tag in both lists).
- **apply**: `wanted` surfaced in report + candidate left; `reject` candidate logged + spliced; `park` candidate untouched; entries loop still green.
- **server**: PUT round-trips a file carrying scorecard + candidates; GET token == PUT token (no spurious 409) for a v2 file migrated to v3.
- **diff/UI**: unaffected by data-model change (diff tests already green).
- Full `node --test` green; `node bin/cli.js` regenerates both skill trees.

## Out of scope (YAGNI)

- Inline AI drafting in the server (no model access; that is the agent's job in `/instruction-apply`).
- Auto-adopting agent-authored drafts (human reviews the parked entry first).
- Editing the scorecard in the UI (it is a read-only round artifact).
- Per-cell drill-down beyond the `details` list.
