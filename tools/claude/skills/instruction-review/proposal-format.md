# Proposal format and the decisions log

Reference for the instruction-review application (`#ai-instruction-review`): the proposal schema, the rubric, and how the decisions log is maintained.
This application **proposes, then triages via an editable worksheet** -- it edits instruction sources only through `/instruction-apply` on the human's recorded worksheet decisions (#swe-done).
It generalizes `prompts/review-instructions.md` from one umbrella reviewer to a per-role fan-out; that prompt's rubric and decision-logging steps are reused here, not duplicated.

## Schema

```typescript
type ProposalKind =
  | 'new-rule'    // a rule the domain expects but the set lacks
  | 'strengthen'  // an existing rule that is too weak/ambiguous
  | 'rehome'      // an existing rule that should move to a different instructions/ file
  | 'reowner';    // an existing rule whose ownership row should change owner

interface InstructionProposal {
  kind: ProposalKind;
  tag: string;        // new #tag (new-rule) or an existing #tag (strengthen/rehome/reowner)
  role: string;       // role id (lens) that raised it -- ties the proposal to the shared registry
  gap: string;        // the gap or problem it addresses
  rationale: string;  // one line
  status: 'ready' | 'blocked' | 'conditional'; // proposal status (a deferred decision records the condition)
  blockedOn?: string; // a #tag or condition, when status is blocked/conditional
  targetFile?: string;    // new-rule/strengthen: the instructions/ file the rule belongs in
  draft?: string;         // new-rule/strengthen: a drop-in house-style rule block, once concrete
  proposedFile?: string;  // rehome: where the rule should move
  proposedOwner?: string; // reowner: the role / base lens / non-review marker it should be owned by
}
```

**Required per kind** (the reduce step rejects a proposal missing its kind's field): `new-rule` and `strengthen` require `targetFile`; `new-rule` also requires `draft` once concrete; `rehome` requires `proposedFile`; `reowner` requires `proposedOwner`, which must be a **resolvable owner** (a declared role, the `swe` base lens, or a known non-review marker -- else the editor rejects/normalizes it).

A `draft` is written **verbatim** into a `.md` by `/instruction-apply`, so author it in house markdown style -- `#code-markdown`: one sentence per line, hard-wrap only at sentence boundaries (never by column), lists/tables/fenced blocks left intact. (`#code-markdown`'s own trigger is "editing a `.md`"; a draft is the `.md`'s future content, so the style applies at authoring time.)

The triage worksheet is the structured **`triage.json`** (`{ round, scorecard, candidates, entries }`; schema + validator in `devtools/triage-ui/schema.mjs`, full shape in the instruction-review SKILL).

### Persisted worksheet (scorecard + candidates)

The worksheet carries two siblings to `entries` that the editor (reduce step) writes each round:

```typescript
type Verdict  = 'strong' | 'good' | 'weak' | 'gaps';
type Priority = 'high' | 'medium' | 'low';

interface Scorecard {
  lenses: string[];           // column order for the matrix, e.g. ['swe','security','db','qa','docs','frontend','ux','ai','git']
  perLens: PerLensRow[];      // one row per dimension (e.g. 'coverage', 'clarity', 'ownership')
  global: GlobalRow[];        // one row per global dimension (e.g. 'cohesiveness', 'self-reference', 'lean-split', 'normative-voice')
  details: Finding[];         // findings that drove weak/gaps cells
  nits: string[];             // mechanical-nits list
}
interface PerLensRow { dimension: string; cells: Cell[]; }  // one cell per lens, positionally aligned
interface Cell       { lens: string; verdict: Verdict; }
interface GlobalRow  { dimension: string; verdict: Verdict; }
interface Finding    { dimension: string; lens?: string; file: string; tag: string; verdict: Verdict; note: string; }

interface Candidate {
  tag: string;
  kind: 'new-rule' | 'strengthen' | 'rehome' | 'reowner';
  role: string;
  targetFile: string;
  gap: string;
  priority: Priority;
  decision: { verdict: 'park' | 'wanted' | 'reject'; details?: string };
  // NO `draft`, NO `applyLog` -- a candidate is not an entry.
}
```

`Scorecard` is a per-round artifact: each round's reduce overwrites it.
`scorecard` is `null` when the setup gate's "Stop and process" path runs (no reduce).

`Candidate` verdict flow:

| verdict | meaning | who acts | effect |
|---|---|---|---|
| `park` (default) | undecided | — | left in `candidates`; re-surfaces next round |
| `wanted` | "draft this" | `/instruction-apply` agent | agent authors a house-style draft, writes it into `triage.json` as a new entry (`verdict: park`, `status: ready`, draft filled), and removes the candidate in one atomic write |
| `reject` | "ignore this" | apply engine | splice from `candidates` + write one canonical decisions-log line so it does not re-surface |

Each entry projects the proposal as typed fields plus a `decision` object (`verdict` defaulting to `park`; typed params `details`/`foldTarget`) and an `applyLog`.
For a `strengthen` (and a text-changing `rehome`/`reowner`) the entry also carries a read-only **`current`** field -- the verbatim live `## #tag` section the draft replaces -- so the UI shows a before/after; it is review-surface only and `/instruction-apply` never reads it.
`new-rule` has no `current`.

## Rubric

The rubric is the nine dimensions of the single-agent fallback `prompts/review-instructions.md` (#swe-reuse), split by where they run.

**Per-lens** -- each participating role applies these within its domain:

- **Coverage** -- a rule the domain expects that is missing or too weak.
- **Clarity** -- unambiguous for human and agent; no overloaded section, vague scope, or undefined term.
- **Terseness** -- token-conscious; no recitation of common knowledge, no spec-level detail that belongs in a doc, no redundancy.
- **Efficiency** -- applicable systematically; file-anchored, checkable rules over aspirational prose.
- **Enforceability** -- lint-able / CI-checkable, and the set states the rule is enforced.
- **Ownership & placement** -- whether a rule the role owns (or believes belongs to its lens) is owned by the right role and located in the best file; raise a `rehome` or `reowner` where not.

These six per-lens dimensions are scored separately (clarity, terseness, efficiency, and enforceability are not merged): they co-vary but a split lets "terse but unclear" or "clear but unenforceable" surface at a glance.

**Global / structural** -- **not** per-lens; the editor runs these once in reduce, and **no role duplicates them**:

- **Cohesiveness** -- no rule contradicts another or the house style.
- **Self-reference integrity** -- every `#tag` resolves, every section has a unique tag.
- **Lean-split integrity** -- no core rule references a bundle-only tag.
- **Normative voice** -- consistent **MUST** / **Never** / `should`.

**Mechanical nits** -- a separate editor sweep for typos, grammar, stray whitespace, broken links, invalid markup.

## Dimension scorecard (presented each round, never committed)

The reduce step does not just write proposals -- it **accounts for every rubric dimension** and the round's present step surfaces the result, so a dimension is never silently skipped (the failure this scorecard exists to prevent).

For **each** rubric dimension (the six per-lens -- coverage, clarity, terseness, efficiency, enforceability, ownership & placement -- consolidated across roles, plus the four global/structural), the editor emits one `Finding` per rule that scores below **Strong**, each citing `file`, `#tag`, and its own `verdict` -- **Strong / Good / Weak / Gaps**. The cell (and global) verdict is then the **worst** of those findings, and **Strong** when there are none. A `Weak`/`Gaps` finding ties to the proposal(s) it produced. The mechanical nits are listed separately as a short actionable list.

The per-rule findings come from the fan-out reviewers; the editor only consolidates and rolls them up -- it never asserts a cell verdict independently of its findings. A clean rule produces no finding (and so contributes **Strong**).

This mirrors the fallback prompt's output format. The scorecard and nits are **presented to the user, not committed** -- the only committed file is the decisions log.

## Decisions log (the only committed file)

The single committed output is the decisions log `docs/instruction-rules-decisions.md` -- a lean, ADR-style record of *closed judgments*, not a backlog of open proposals. The open queue and drafts are ephemeral (regenerated by each full audit, presented in triage, never committed); only decisions persist, so rounds neither re-litigate nor prematurely re-raise. There is no issue store, no round store, no commit baseline.

Format -- one line per `#tag`, no draft blocks:

- `#tag -- rejected: <reason>`
- `#tag -- folded into <X>: <reason>`
- `#tag -- deferred: <condition to adopt> (-> <basename(targetFile)>, <role>)` -- the deferral, its trigger, and the placement hint (file **basename**, e.g. `swe.md`) persist; the draft does **not** (a future audit re-drafts when the condition holds; the dropped draft stays in git history).

(In the live log the leading `#tag` is backtick-wrapped, e.g. `` `#swe-ci` -- deferred: … ``; apply generates this grammar from typed fields.)

The log holds **at most one entry per `#tag`**: before appending, check for an existing entry and update it rather than duplicate (a duplicate would erode the "stops re-litigation" guarantee).

Writes happen in the **Apply pipeline** (`/instruction-apply`), driven by each `triage.json` entry's `decision.verdict` (`adopt`/`reject`/`fold`/`defer`/`refine`; default `park`), with reason/condition/input from `decision.details` and the fold target from `decision.foldTarget`: `reject`/`fold`/`defer` write a decision line here; `adopt` writes to `instructions/` (not here, via guided ensure-end-state adoption + `npm test`); `refine` writes nothing -- it is surfaced for discussion; `park` stays in the worksheet `.agentsmith/instruction-review/triage.json` (not here) and re-surfaces next round. Before adopting, drop any decisions-log or live-`#tag` duplicate (check `node bin/cli.js --stdout`). Adoption stays a deliberate human action -- the round only writes the worksheet; applying the human's decisions is the separate, gated `/instruction-apply` step.
