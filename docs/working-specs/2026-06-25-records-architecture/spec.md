# Records architecture: design-decisions log, spec index, plan pruning, authoring conformance

Status: Draft

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
> working specs link **out** to a decision by slug; a decision need not enumerate referrers.
> Distinct from `docs/instruction-rules-decisions.md` (regenerated instruction-review audit
> output, not hand-authored rationale). Kept current under `#swe-docs-drift`, gated by
> `#swe-done`.

Cross-references used (all must resolve): `#swe-reference-spec`, `#ai-plan`,
`#ai-instruction-review`, `#swe-docs-drift`, `#swe-done`.

### C. Wiring into existing rules

- **`#ai-plan`** gains two clauses:
  1. A new working spec is checked against the current reference spec
     (`#swe-reference-spec`) and design decisions (`#swe-design-decisions`): it **conforms,
     or states explicitly where and why it diverges**, and whether those present-truth docs
     must change. The change itself is applied at `#swe-done`; here it is surfaced and
     justified.
  2. A plan reaching `Status: Implemented` **may be pruned** (execution scaffolding; the
     frozen spec, shipped code, and git carry the result). The spec is never pruned. The set
     of working specs is indexed at generated `docs/working-specs/INDEX.md`.
- **`#swe-done`** item 2 gains "…and the design-decisions log when standing rationale
  changed (`#swe-design-decisions`)"; mechanical upkeep gains "the working-specs index is
  regenerated."
- **`#ai-session-hygiene`** extends its persist menu: a reusable work standard, a memory,
  **or a cross-cutting design decision (`#swe-design-decisions`)** — scoped by the same
  reach test.
- **`#swe-reference-spec`** gains one cross-reference line naming the design-decisions log
  as its WHY counterpart.

### D. Generated working-specs index

A small Node ESM generator scans `docs/working-specs/*/spec.md`, reads the H1 title and the
`Status:` token, and writes `docs/working-specs/INDEX.md`: a table sorted by date
descending, with a "generated — do not hand-edit" banner. `INDEX.md` is **committed** (it is
human-browsable on the forge, unlike the gitignored `AGENTS.md`). A test regenerates the
index into memory and diffs it against the committed file, failing when stale. CLI wiring
(a `bin/cli.js` subcommand vs a dedicated entry) is decided in the plan; it follows the
existing generator's conventions.

### E. Scope

One working spec. Implementation tasks (sequenced in the plan):

1. New rule `#swe-design-decisions` + ownership row; integrity gate green.
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
retroactively; their decisions stay discoverable via `INDEX.md` and grep.

## Verification

- Generator runs clean; `AGENTS.md` regenerated with the new rule and the four amended
  rules; all referenced `#tag`s resolve (dangling-tag gate).
- Ownership coverage lint green (exactly one new row, no orphan/duplicate).
- Index drift test passes; `INDEX.md` matches the generator output.
- Full `node --test` suite green.
