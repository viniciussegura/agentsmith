# Records architecture: design-decisions log, spec index, plan pruning, authoring conformance

Status: Implemented

**Date:** 2026-06-25
**Origin:** Follow-up to the instruction-set-coexistence work. A review of how this
repo keeps specs, plans, and rationale surfaced four frictions: provenance is scattered
across many frozen working specs (read several to get the picture), the file pile is
noise for humans and agents, the *why* behind cross-cutting choices has no queryable home,
and new specs can silently contradict the standing architecture.

## Problem

The repo already runs a layered record system (working specs/plans, reference spec,
future-work, technical-debts, plus a narrow instruction-review decisions log). Four gaps
remain:

1. **No home for standing rationale.** *Why* a cross-cutting choice was made lives only
   inside the working spec that introduced it. To learn the current rationale behind the
   architecture you must read many frozen specs and infer which still hold.
2. **No spec index.** ~22 working-spec units exist with no single entry point; discovery is
   by directory listing.
3. **Plans accumulate forever.** A plan is execution scaffolding with low residual value
   once its unit ships, yet it is frozen alongside the spec, growing the file pile.
4. **New specs are unconstrained by present truth.** Nothing requires a new working spec to
   reconcile against the current reference spec and rationale, so a spec can silently
   contradict the standing system.

## Decisions

- **A new mutable rationale log**, `docs/design-decisions/`, one file per decision, sibling
  of the reference spec (present-truth family) — not a dated immutable ADR (that would
  duplicate the frozen spec's historical role and reintroduce staleness).
- **Capture is soft**: a `#ai-session-hygiene` prompt, never a `#swe-done` merge gate. Only
  mechanical upkeep (index regen, present-truth currency) is gated.
- **Plans prunable** once `Status: Implemented`; specs never pruned.
- **Generated working-specs index**, committed, with a drift test.
- **Authoring conformance**: a new working spec conforms to current present-truth or states
  why it diverges and whether those docs must change.

## Conformance

(Dogfoods the `#ai-plan` conformance clause this spec introduces.) Checked against current
present-truth:

- **Reference spec** (`docs/reference-spec/entity-model.md`) — unaffected; this change adds no
  entity and alters no existing one.
- **Design decisions** — none exist yet (`docs/design-decisions/` is created by this work), so
  there is nothing to conform to or diverge from.
- **Divergence:** none. No present-truth document is contradicted; no present-truth update is
  required by this spec beyond the records it itself creates.

## Design

### A. Record taxonomy

Two families. **Present-truth** = mutable, self-replacing, kept current, never stale.
**Point-in-time** = frozen/dated, the historical record.

| Record | Directory | File name | Mutable? | Family | Answers |
|---|---|---|---|---|---|
| Working spec | `docs/working-specs/<date>-<slug>/` | `spec.md` | frozen on `Approved` | point-in-time | design of this unit, *why-then* |
| Working plan | `docs/working-specs/<date>-<slug>/` | `plan.md` | frozen; prunable once `Implemented` | point-in-time | how this unit was executed |
| **Design decision** (new) | `docs/design-decisions/` | `<decision-slug>.md` | mutable, self-replacing | present-truth | **WHY the system is as it is, now** |
| Reference spec | `docs/reference-spec/` | `<slug>.md` | mutable, self-replacing | present-truth | WHAT + HOW the system is, now |
| Future-work | `docs/future-work/` | `<date>-<slug>.md` | removed when done | point-in-time | what we deferred |
| Technical-debt | `docs/technical-debts/` | `<date>-<slug>.md` | removed when paid | point-in-time | what we compromised |

**Boundaries:**

1. **Design-decision vs reference-spec** — WHY (now) vs WHAT/HOW (now); both mutable
   present-truth. **Many-to-many**: a reference spec cites several decisions; a decision
   impacts several reference specs. Linked **one-way** — present-truth docs and specs link
   *out* to a decision by slug; a decision does not enumerate its referrers.
2. **Design-decision vs the working spec's own rationale** — scope **by reach**: a choice
   local to one unit stays in that frozen spec; a choice that binds other work or would be
   re-litigated earns a decision file. Past rationale survives in the frozen spec + git, so
   the log carries current-why only (no staleness, no read-newest-to-oldest).
3. **Design-decision vs `docs/instruction-rules-decisions.md`** — general hand-authored
   rationale vs the regenerated audit output of the instruction-review application
   (`#ai-instruction-review`). Separate, cross-referenced, not merged.

**Where to look (intent → record):**

- *Why is the system designed this way?* → a `docs/design-decisions/` file (linked from the
  relevant reference spec / working spec).
- *What does the system do now, and how?* → the reference spec.
- *What happened in this unit of work, and why then?* → its frozen working spec (+ git).
- *What does decision X affect?* → grep its slug across `docs/` (one-way linking is
  deliberate; no reverse index is maintained — see Boundary 1).

### B. New rule `#swe-design-decisions`

New file `instructions/core/swe/swe-design-decisions.md`; one ownership row
(`swe-design-decisions: swe`). Content (final prose decided in the plan; substance):

> Records *why* the system is as it is now — the standing rationale for choices that bind
> work beyond the unit that introduced them. Lives under `docs/design-decisions/`, one file
> per decision (`<decision-slug>.md`), created lazily, never preemptively. Like the
> reference spec (`#swe-reference-spec`) and unlike working specs (`#ai-plan`), a decision
> file is **mutable and self-replacing**: no `Status:` line, no date in the name; edit in
> place when the decision changes, delete when abandoned. Past rationale is preserved by the
> frozen working spec that introduced the change and by git — the log never accretes
> superseded entries. Scope by reach: unit-local choices stay in the working spec; only
> cross-cutting or re-litigated choices earn a file. It is the WHY counterpart to the
> reference spec's WHAT/HOW; the relationship is many-to-many. Present-truth documents and
> working specs link **out** to a decision by slug; a decision need not enumerate referrers —
> to find what a decision affects, grep its slug. A decision is always **project scope** (a
> committed repo file); there is no generated reverse index. Distinct from
> `docs/instruction-rules-decisions.md` (regenerated instruction-review audit output, not
> hand-authored rationale). Kept current under `#swe-docs-drift` and gated by `#swe-done`,
> which checks that **existing** decision files are not left stale — never that a new one
> must be authored (authoring stays a soft `#ai-session-hygiene` prompt).

Cross-references used (all must resolve): `#swe-reference-spec`, `#ai-plan`,
`#ai-instruction-review`, `#swe-docs-drift`, `#swe-done`.

### C. Wiring into existing rules

- **`#ai-plan`** gains two clauses:
  1. **Conformance.** A new working spec carries a short **Conformance** section stating it
     conforms to the current reference spec (`#swe-reference-spec`) and design decisions
     (`#swe-design-decisions`), or naming where and why it diverges and whether those
     present-truth docs must change. The statement's home is that named section, so author
     and reviewer both know where to look; it is **enforced by the adversarial spec review**
     (`#ai-spec-review`) — a spec that silently contradicts present-truth without
     justification is a blocking finding (no automated lint). Any divergence's doc updates
     are applied later at `#swe-done`.
  2. **Plan pruning.** A plan reaching `Status: Implemented` **may be pruned** — an explicit
     exception to the append-only rule for plans (deletion, not in-place mutation),
     justified because a plan is execution scaffolding with no residual present-truth; the
     frozen spec, shipped code, and git carry the result. The spec is **never** pruned. The
     set of working specs is indexed at generated `docs/working-specs/INDEX.md`.
- **`#swe-done`** item 2 (docs-currency) gains a clause parallel to the reference-spec one it
  already carries: **when this change altered an existing decision's rationale, that
  `docs/design-decisions/` file is brought current** (`#swe-design-decisions`). This is a
  currency check on **existing** files, **not** a requirement to author a new decision —
  authoring stays soft (`#ai-session-hygiene`), so Section B's "never a merge gate" holds.
  Mechanical upkeep also gains "the working-specs index is regenerated" — regenerated
  whenever a spec is added or its `Status:` changes; the drift test is the backstop, not the
  trigger.
- **`#ai-session-hygiene`** extends its persist menu: a reusable work standard, a memory,
  **or a cross-cutting design decision (`#swe-design-decisions`)**. A design decision is
  always **project scope** (a committed `docs/design-decisions/` file); the reach test
  decides only *whether* it warrants a file, independent of the session/project/user tier
  that scopes standards and memories.
- **`#swe-reference-spec`** gains one cross-reference line naming the design-decisions log
  as its WHY counterpart.

### D. Generated working-specs index

A small Node ESM generator scans `docs/working-specs/*/spec.md`, reads the H1 title and the
`Status:` token, and writes `docs/working-specs/INDEX.md`: a table sorted by date
descending, with a "generated — do not hand-edit" banner. `INDEX.md` is **committed** (it is
human-browsable on the forge, unlike the gitignored `AGENTS.md`). CLI wiring (a `bin/cli.js`
subcommand vs a dedicated entry) is decided in the plan; it follows the existing generator's
conventions.

**Drift test.** `test/working-specs-index.test.mjs` runs under `node --test`: it invokes the
generator to produce the index as a string and `assert.equal`s it against the committed
`docs/working-specs/INDEX.md`, failing when the committed file is stale. The test is the
**backstop**; the **trigger** is mechanical upkeep under `#swe-done` (regenerate whenever a
spec is added or its `Status:` advances), so a forgotten regen surfaces as a red test, not a
silently wrong index.

### E. Scope

One working spec. Implementation tasks (sequenced in the plan):

1. New rule `#swe-design-decisions` + ownership row; the instruction-integrity gates pass
   (dangling-tag resolution + ownership coverage, per `test/instruction-integrity.test.mjs`).
2. Wire the four existing rules (Section C).
3. Index generator + `INDEX.md` + drift test.
4. Seed `docs/design-decisions/` with the already-warranted decisions this work and its
   predecessor produced (e.g. `instruction-precedence.md`, `records-architecture.md`) —
   legitimate, not preemptive.
5. Migrate the three stray `docs/superpowers/{specs,plans}/` units into
   `docs/working-specs/` so the index is complete.
6. Regenerate `AGENTS.md` (gitignored; not committed).

## Out of scope

- Preemptively growing the reference spec beyond its current member (contradicts its own
  lazy-creation rule).
- Folding `docs/instruction-rules-decisions.md` into the new log.
- Backfilling rationale files for all historical decisions.

**Note:** frozen specs are append-only, so existing specs will not receive out-links
retroactively; the decisions they introduced stay discoverable by grepping the decision slug
(the spec `INDEX.md` indexes specs, not decisions).

## Verification

- Generator runs clean; `AGENTS.md` regenerated with the new rule and the four amended
  rules; all referenced `#tag`s resolve (dangling-tag gate).
- Ownership coverage lint green (exactly one new row, no orphan/duplicate).
- Index drift test (`test/working-specs-index.test.mjs`) passes; committed
  `docs/working-specs/INDEX.md` matches generator output.
- Full `node --test` suite green.
