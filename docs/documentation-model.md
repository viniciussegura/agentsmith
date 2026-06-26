# Documentation model

How this repository organizes its records. Two families: **present-truth** is
mutable, self-replacing, kept current, never stale; **point-in-time** is
frozen/dated, the historical record.

| Record | Directory | File name | Mutable? | Family | Answers |
|---|---|---|---|---|---|
| Working spec | `docs/working-specs/<date>-<slug>/` | `spec.md` | frozen on `Approved` | point-in-time | design of this unit, *why-then* |
| Working plan | `docs/working-specs/<date>-<slug>/` | `plan.md` | frozen; prunable once `Implemented` | point-in-time | how this unit was executed |
| Design decision | `docs/design-decisions/` | `<decision-slug>.md` | mutable, self-replacing | present-truth | **WHY the system is as it is, now** |
| Reference spec | `docs/reference-spec/` | `<slug>.md` | mutable, self-replacing | present-truth | WHAT + HOW the system is, now |
| Future-work | `docs/future-work/` | `<date>-<slug>.md` | removed when done | point-in-time | what we deferred |
| Technical-debt | `docs/technical-debts/` | `<date>-<slug>.md` | removed when paid | point-in-time | what we compromised |

The set of working specs is indexed at the generated [`docs/working-specs/INDEX.md`](working-specs/INDEX.md)
(`agentsmith spec-index`; a drift test is the backstop).

## Boundaries

1. **Design-decision vs reference-spec** — WHY (now) vs WHAT/HOW (now); both
   mutable present-truth. **Many-to-many**: a reference spec cites several
   decisions; a decision impacts several reference specs. Linked **one-way** —
   present-truth docs and specs link *out* to a decision by slug; a decision
   does not enumerate its referrers.
2. **Design-decision vs the working spec's own rationale** — scope **by reach**:
   a choice local to one unit stays in that frozen spec; a choice that binds
   other work or would be re-litigated earns a decision file. Past rationale
   survives in the frozen spec + git, so the log carries current-why only (no
   staleness, no read-newest-to-oldest).
3. **Design-decision vs `docs/instruction-rules-decisions.md`** — general
   hand-authored rationale vs the regenerated audit output of the
   instruction-review application (`#ai-instruction-review`). Separate,
   cross-referenced, not merged.

## Where to look (intent → record)

- *Why is the system designed this way?* → a [`docs/design-decisions/`](design-decisions/)
  file (linked from the relevant reference spec / working spec).
- *What does the system do now, and how?* → the [reference spec](reference-spec/).
- *What happened in this unit of work, and why then?* → its frozen working spec
  (+ git).
- *What does decision X affect?* → grep its slug across `docs/` (one-way linking
  is deliberate; no reverse index is maintained — see Boundary 1).

This model is governed by the `#ai-plan`, `#swe-reference-spec`, and
`#swe-design-decisions` rules under [`instructions/`](../instructions/), and its
rationale is recorded in [`docs/design-decisions/records-architecture.md`](design-decisions/records-architecture.md).
