# Scorecard derived cells — per-instruction findings drive the matrix

**Status:** reviewed — converged after 5 adversarial rounds (blocking 7→4→2→1→0)
**Date:** 2026-06-19
**Touches:** `devtools/triage-ui/schema.mjs`, `devtools/triage-ui/app.js`, `devtools/triage-ui/style.css`, `.claude/skills/instruction-review/proposal-format.md` + source `tools/claude/skills/instruction-review/proposal-format.md`, `.claude/agents/instruction-editor.md` + source `tools/claude/agents/instruction-editor.md`, tests.

## Problem

The dimension scorecard cell is a **holistic verdict** the reviewer asserts independently:
"swe lens × clarity → good." Findings (`scorecard.details[]`) only attach to weak/gaps cells, and
**nothing links the cell verdict to its findings** — a reviewer can write `good` on a cell whose
findings say `gaps`, with no validation catching it. There is also no per-instruction drill-down:
you see "clarity is weak for the swe lens" but not *which* of the ~61 rules drag it down, except
informally via whatever findings the reviewer chose to attach.

Two rejected alternatives (see discussion):

- **Full per-rule matrix** — grade all 61 rules × 6 dimensions individually (~366 grades).
  Rejected: ~7× worksheet size, mostly noise (`strong` rows carrying no signal), unreliable on the
  cheap fan-out models, and amplifies a round-over-round-diff temptation the ephemeral scorecard
  forbids.
- **Status quo** — independent cell verdict + optional findings. Rejected: the cell↔findings
  contradiction is unguarded and good cells offer no drill-down.

## Solution

Make the cell verdict **derived from its findings**, not independently asserted. A finding becomes the
single unit of "a rule scored below perfect on a dimension"; the matrix is a roll-up of findings by
worst-score.

### Core rule

For a per-lens cell `(dimension d, lens l)`:

```
cell.verdict = worst({ f.verdict : f in details, f.dimension == d, f.lens == l })  || 'strong'
```

For a global row `(dimension d)`:

```
row.verdict  = worst({ f.verdict : f in details, f.dimension == d, f.lens is absent }) || 'strong'
```

- `worst` orders `strong < good < weak < gaps` (rank 0..3; worst = max rank). Ties (two findings of
  the same verdict) are a no-op — the verdict is unchanged.
- **No matching finding ⇒ `strong`** ("nothing wrong = strong").
- A `Finding` gains a required `verdict ∈ strong|good|weak|gaps`. In practice reviewers emit
  `good|weak|gaps` (a `strong` finding is allowed but pointless — it changes no cell); the validator
  accepts all four for uniformity. A `strong` finding never renders in the drill-down (see UI) and
  never makes a cell clickable.
- **`lens` absent ≡ `lens: null`.** A *global* finding is one whose `lens` is absent **or** `null`;
  a *per-lens* finding has a non-empty string `lens`. `migrateWorksheet` normalizes `lens: null` to
  absent (deletes the key) so the canonical form has exactly one representation. Matching uses
  `f.lens == null` (loose) for the global case and `f.lens === cell.lens` for the per-lens case.
  **Implementation trap:** after migration a global finding has no `lens` key, so `f.lens` is
  `undefined`, not `null`. Loose `f.lens == null` is required (not `=== null`) precisely because
  `undefined == null` is `true` in JS — it covers both the pre-migration (`null`) and post-migration
  (absent) forms. Using strict `=== null` would silently break global matching on migrated cards.
- **Duplicate findings** (same `dimension`/`lens`/`tag`) are allowed: `worst` collapses them to the
  worst verdict for the cell roll-up. The UI may show duplicate finding rows; reduce should avoid
  emitting them but the validator does not reject them.

The cell/global verdict is **still stored** (the matrix shape and the version token stay stable, and
the UI does not duplicate derive logic), but the validator **enforces** `stored == derived`. This is
the whole point: the contradiction becomes structurally impossible, and every non-strong cell is
guaranteed to carry ≥1 finding to drill into.

### Why store-and-enforce rather than store-nothing-derive-on-render

Keeping `cells[].verdict` and validating equality is the lowest-churn form: the matrix shape, the
`canonicalJSON` token, and the existing UI render are untouched; only `Finding.verdict` is new. The
guarantee (no contradiction, no orphan non-strong cell) is identical to dropping the stored verdict.

**The browser UI never writes scorecard verdicts.** `scorecard` is read-only review surface — the
only scorecard mutations the front-end performs are the existing nit operations (dismiss a nit,
toggle a nit's `fix:'auto'`); it never sets `details[].verdict` or `cells[].verdict`. The PUT body's
scorecard is whatever was loaded via GET, carried through unchanged except for nits. Combined with
migrate-always-recomputes (above), this means the equality check can never block a legitimate write:
- a UI PUT carries a self-consistent card (it only touched nits) → passes;
- even if a cell were stale relative to findings, the PUT path's `migrateWorksheet(body.data)`
  (server.mjs line 169, *before* `validateFile`) recomputes cells from findings → passes.

The equality validator is therefore a **contract check for direct (non-migrated) writes** — the
`/instruction-review` reduce step that authors the card, and the schema unit tests — not a gate the
UI can trip. Only the reduce step authors verdicts, and it writes consistent values by construction.

## Schema changes (`devtools/triage-ui/schema.mjs`)

### `Finding`

```
interface Finding { dimension: string; lens?: string; file: string; tag: string; verdict: Verdict; note: string; }
```

- New required field `verdict ∈ SCORECARD_VERDICTS`.
- `validateScorecard` `details[]` check additionally requires `verdict` to be a member of
  `SCORECARD_VERDICTS`. While here, also add the missing `!nonEmpty(f.dimension)` guard to that check:
  the current code (schema.mjs line 167) validates `file`/`tag`/`note` but **not** `dimension`, yet
  `dimension` is required for a finding to roll into any cell — a dimension-less finding silently
  matches nothing. Add it alongside `verdict`.

### Export a pure helper

```
export const SCORECARD_RANK = { strong: 0, good: 1, weak: 2, gaps: 3 };

/**
 * Worst verdict among an ALREADY-FILTERED finding list, 'strong' when empty.
 * The caller filters by (dimension, lens) first — deriveVerdict does not filter.
 */
export function deriveVerdict(filteredFindings) { ... } // max rank, else 'strong'
```

`deriveVerdict` takes a pre-filtered list (no `dimension`/`lens` args): the caller selects the
matching findings, then asks for their worst. Both call sites filter first:

- the validator, per stored cell/row, over `details` matching that cell/row;
- `migrateWorksheet`, per cell/row, to recompute.

The derive rule (rank order + empty⇒strong) thus lives in exactly one place.

### `validateScorecard` equality enforcement

**This is net-new validator logic**, not a tightening of an existing check — today's `validateScorecard`
(schema.mjs lines 136-183) does not call `deriveVerdict` and would pass a `weak` cell whose only
finding is `gaps`. Add a new block **after** the existing matrix-alignment checks: for each `perLens`
cell and each `global` row, compute the expected verdict via `deriveVerdict` over the matching
`details` and push a problem when `stored !== expected`:

```
scorecard.perLens[i].cells[j]: verdict "good" != derived "gaps" from its findings
scorecard.global[i]: verdict "good" != derived "strong" from its findings
```

Matching is positional/by-name: a finding matches a per-lens cell when
`f.dimension === row.dimension && f.lens === cell.lens`; it matches a global row when
`f.dimension === row.dimension && (f.lens == null)`.

A finding whose `(dimension, lens)` matches **no** declared cell/row is allowed (it still renders in
the unfiltered findings list) — equality is enforced per stored cell, not per finding, so an
over-eager finding never breaks validation; it simply may not roll into a visible cell. (Reduce
should not emit such findings; this is a leniency, not a contract.) These orphan findings appear only
in the unfiltered list — clicking any cell never highlights them.

### `migrateWorksheet`

A scorecard is per-round and overwritten by the next reduce, but the current on-disk worksheet has a
pre-change scorecard that must survive a GET→PUT round-trip without a spurious 400. Migration makes
**any** card self-consistent under the new rule, in one pass, composed with the existing nit
normalization (string nits → `{text}`):

1. **Normalize `lens`** on each finding: if `lens` is `null`, delete the key (canonical "global"
   form is absent, not null).
2. **Default a missing `verdict`** on each finding to **the stored verdict of the cell/row it rolls
   into**, not a blanket `'weak'`. Look up the matching `perLens` cell (`f.dimension`,`f.lens`) or
   `global` row (`f.dimension`, lens absent) in the *pre-recompute* stored matrix and copy its
   verdict; fall back to `'weak'` only when the finding matches no stored cell/row. The global-row
   lookup here uses the **same loose `f.lens == null`** as everywhere else: step 1 just converted
   `lens: null` to absent, so `f.lens` is now `undefined` and only loose equality matches it. This
   preserves
   historical severity — a lone finding under a stored `gaps` cell becomes a `gaps` finding, so the
   recompute reproduces `gaps` (defaulting to `'weak'` would have silently downgraded it). Use
   nullish-coalescing semantics (`verdict ?? <cellVerdict> ?? 'weak'`) so a present-but-falsy edge
   case is handled and the step is a true no-op when `verdict` is already set — preserving
   idempotency.
3. **Recompute** every `perLens` cell verdict and every `global` row verdict via `deriveVerdict` over
   the (now verdict-bearing, lens-normalized) findings. This guarantees the card satisfies the
   equality check by construction.

A stored cell whose verdict is non-`strong` but has **zero** matching findings is recomputed to
`strong` — finding absence overrides the historical assertion. This is intentional, not a bug: the
old reviewer's bare `weak` (with no finding to back it) carried no drill-down anyway, and the next
`/instruction-review` round rewrites the whole scorecard. The scorecard is ephemeral by design, so no
durable judgment is lost.

Recompute runs on **every** migration, not only old cards. That is what makes the server PUT path
safe (below): a body whose cells are stale relative to its findings is silently re-derived before
validation, so the equality check can never spuriously 400 a PUT.

Idempotent: on an already-v-next card, step 1 is a no-op (no `null` lens), step 2 is a no-op (every
finding has a `verdict`), and step 3 recomputes the same values.

## Reviewer / editor behavior

### `proposal-format.md` (rubric section + scorecard section)

- A reviewer, scoring a dimension within its lens, emits **one finding per rule that scores below
  `strong`**, each carrying `{dimension, lens, file, tag, verdict, note}`. A clean rule produces no
  finding. The cell is the worst of those findings (else `strong`) — the reviewer no longer asserts a
  separate cell verdict.
- State the worst-score aggregation and the "no finding ⇒ strong" rule explicitly.
- Update the `Finding` TypeScript block to include `verdict`.

### `instruction-editor.md` (reduce role)

- "Dimension scorecard + nits" bullet: the editor **derives** each per-lens cell and global row from
  the consolidated findings (worst-score), rather than restating a holistic verdict. It still scores
  the four global/structural dimensions, but does so by emitting global findings (lens absent) with a
  verdict and letting the row roll up.
- **Output section, exact line:** the inline type currently reads
  `details[{dimension, lens?, file, tag, note}]` (instruction-editor.md line 32) — change it to
  `details[{dimension, lens?, file, tag, verdict, note}]` (verdict ∈ strong|good|weak|gaps), and add
  a sentence that cells/global are the worst-score roll-up of those findings (no independent cell
  verdict). Without this line change a model following the prompt emits verdict-less findings that
  fail validation.

Both files exist twice — edit the **source** under `tools/claude/**` and regenerate (`node bin/cli.js`)
so `.claude/**` matches; never hand-edit the generated copy (the build overwrites it). After regen,
verify the copies tracked the source:
`git diff --stat .claude/skills/instruction-review/proposal-format.md .claude/agents/instruction-editor.md`
should show them changed in lockstep with the sources. If a `.claude/**` copy is unchanged while its
source changed, the build step did not run.

## UI (`devtools/triage-ui/app.js`, `style.css`)

`renderScorecardDetail` already renders the matrix and a findings list (it takes no params and reads
`state.data.scorecard` directly). Add:

1. **Finding verdict chip** — each finding row shows its `verdict` as a typed chip (reuse the chip
   styling; a `chip-verdict chip-<verdict>` class, colour by severity). A `strong` finding is **never**
   shown, in any mode, regardless of orphan status or filter state (it carries no signal). Among
   non-strong findings, orphans (no declared cell) appear only when `state.scFilter === null`.
2. **Cell drill-down** — precise behavior:
   - A cell/global row that derives non-`strong` gets a `clickable` affordance and an `onclick`.
     A `strong` cell is **not clickable** (no handler, no pointer cursor), even if `strong` findings
     happen to match it. The clickability check reads the (derived) `cell.verdict !== 'strong'` —
     do not re-inspect the findings inline.
   - Clicking a non-strong cell sets `state.scFilter = {dimension, lens}` (for a global row,
     `lens: null`) and calls `renderScorecardDetail()` again (full re-render, no in-place DOM
     mutation). The render filters `sc.details` to the matching `(dimension, lens)` before building
     the finding rows, and adds a `selected` class to the clicked cell. **The `lens` comparison in
     this filter must use loose equality** (`f.lens == state.scFilter.lens`): post-migration global
     findings have `f.lens === undefined`, and only loose equality matches them against
     `state.scFilter.lens === null` — the same trap as the validator and migration step 2. The
     `dimension` comparison stays strict.
   - **Clear = toggle:** clicking the already-selected cell (or any cell whose `{dimension, lens}`
     equals `state.scFilter`) sets `state.scFilter = null` and re-renders the full list. No separate
     clear button.
   - No auto-scroll — in-place filtering of the findings list is sufficient.
   - When `state.scFilter` is set, only matching findings render; orphan findings (no declared cell)
     never appear under any filter (they show only when `state.scFilter === null`).

`state.scFilter` is a **new top-level field on `state`** (alongside `data`/`version`/`tags`/`view`),
initialized to `null` (the "no filter" sentinel — `null`, not `undefined`, so the
`state.scFilter === null` checks read true on first render), not on `state.view`. It is transient view
state, never written to `triage.json`. **Reset point:**
inside `select(kind, idx)` (app.js ≈ line 106), before setting `state.view`, set
`state.scFilter = null` when `kind !== 'scorecard'` — so a stale filter never leaks into a later
scorecard open.

## Out of scope (deferred)

- **Total-graded denominator** ("1 of 21 weak"). The findings give you the *weak* count per cell for
  free, but not the count of rules graded `strong` (they emit no finding). Surfacing
  `21 graded, 1 weak` would need a per-cell `counts:{graded, weak}` the reduce step fills. Cheap (one
  int pair per cell) but not required for drill-down; revisit only if the denominator proves needed.
- The full per-rule grade matrix (rejected above).

## Test plan

**First, update existing fixtures** (they will fail once `verdict` is required and equality is
enforced): in `test/triage-schema.test.mjs`, `baseScorecard()` (≈ line 203-209) — its `details`
finding is under `(coverage, qa)`, and the `qa` cell's stored verdict is `weak` (line 205), so the
finding's `verdict` must be `weak` to satisfy both the required-field check and equality.
**Also fix the `swe` cell:** it is stored `'good'` (line 205) but has **zero** matching findings, so
it now derives `'strong'` and fails equality. Either change that cell to `'strong'`, or add a
`{ dimension: 'coverage', lens: 'swe', file: '…', tag: '…', verdict: 'good', note: '…' }` finding to
back the `'good'`. Pick one (changing the cell to `'strong'` is the smaller edit). The
matrix-misalignment test (≈ line 217-228) overrides `perLens` cells via `over`; those cases only
assert that a *specific* problem substring is present (not that the problem list is empty), so an
extra "verdict required"/equality problem from the shared finding does not break them — but add a
`verdict` to that finding anyway for clarity. The server round-trip card (`test/triage-server.test.mjs`
≈ line 198) uses `details: []` (empty) and needs no change. Sweep every inline scorecard literal in
both files for `details` findings + cell/finding verdict consistency before adding the new cases below.

`test/triage-schema.test.mjs` (and server/migration tests as needed):

1. **Finding requires verdict** — a `details` entry missing `verdict` ⇒ a problem string.
2. **`deriveVerdict`** (pre-filtered input) — `[]→strong`; `[{good}]→good`; `[{good},{gaps},{weak}]→gaps`;
   ranking order; duplicate same-verdict findings → that verdict.
3. **Equality enforced** — a card whose stored cell verdict ≠ worst-of-findings ⇒ a problem naming the
   cell and both verdicts. A consistent card ⇒ no problem.
4. **No-finding cell must be strong** — a stored `weak` cell with zero matching findings ⇒ a problem
   (it derives `strong`).
5. **Migration preserves severity** — an old card with a `gaps` cell whose single finding has no
   `verdict` migrates so the finding becomes `gaps` (not `weak`) and the recomputed cell stays `gaps`;
   the migrated card passes `validateScorecard`; idempotent on re-run.
6. **Migration composes with nit + lens normalization** — an old card carrying BOTH string nits AND
   verdict-less findings AND a `lens: null` global finding migrates in one pass: nits become objects,
   finding verdicts are cell-defaulted, `lens: null` becomes absent, cells are recomputed — and the
   result passes validation.
7. **Global rows** — same equality + derive behavior for `global[]` with lens-absent findings; a
   `lens: null` finding matches a global row.
8. **Round-trip** — `PUT` of a valid derived card returns 200 and `GET` deep-equals it; and a `PUT`
   whose cells are stale relative to its findings still returns 200 (migrate recomputes), with the
   stored card now consistent (extends the existing scorecard round-trip server test).

Full `node --test` green before commit.

## Migration / rollout

One commit (or a small series): schema + tests first, then skill/agent prose + regen, then UI. The
current on-disk scorecard is migrated on read; the next `/instruction-review` round writes a fresh
derived card. No data loss — the scorecard is ephemeral by design.
