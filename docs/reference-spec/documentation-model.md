# Documentation model

How this repository organizes its records. Two families: **present-truth** is
mutable, self-replacing, kept current, never stale; **point-in-time** is
frozen/dated, the historical record.
A member of the reference spec (`#swe-reference-spec`): it reflects the model as it is **now** and carries no `Status:` line.

| Record | Directory | File name | Mutable? | Family | Answers |
|---|---|---|---|---|---|
| Design decision | `docs/design-decisions/` | `<decision-slug>.md` | mutable, self-replacing | present-truth | **WHY the system is as it is, now** |
| Reference spec | `docs/reference-spec/` | `<slug>.md` | mutable, self-replacing | present-truth | WHAT + HOW the system is, now |
| Epic | `docs/epics/<slug>/` | `README.md` + tree | mutable; deleted when shipped | present-truth\* | the delivery **plan** for multi-deliverable work, now |
| Future-work | `docs/future-work/` | `<date>-<slug>.md` | removed when done | point-in-time | what we deferred |
| Technical-debt | `docs/technical-debts/` | `<date>-<slug>.md` | removed when paid | point-in-time | what we compromised |

\* Epic is present-truth by mutability -- edited in place, never frozen -- but holds a provisional *plan* rather than shipped truth, and is deleted when its last unit of work ships (`#swe-epic`).

**The working spec is not in this table**, and that is the point: it is not a
record. It lives at `.agentsmith/specs/<branch>/<date>-<slug>/`, gitignored and
per-machine, and is deleted when the branch ships (`#ai-plan`). Nothing here is
kept for it, because a unit's durable trace is its PR body (`#git-pr-body`), its
standing rationale a design-decision file, and its site-specific constraints
comments at those sites (`#code-style`).

## Boundaries

1. **Design-decision vs reference-spec** — WHY (now) vs WHAT/HOW (now); both
   mutable present-truth. **Many-to-many**: a reference spec cites several
   decisions; a decision impacts several reference specs. Linked **one-way** —
   present-truth docs link *out* to a decision by slug; a decision
   does not enumerate its referrers.
2. **Design-decision vs everything below its threshold** — scope **by reach**,
   in one tier: a choice that binds other work or would be re-litigated earns a
   decision file. There is no cheaper filing tier, because there is no longer a
   kept artifact to file into. A non-obvious constraint goes in a comment at the
   site it constrains (`#code-style`), naming the decision slug where one
   exists; deliberation about a shipped choice goes in the PR body and is not
   kept at all. Past rationale survives in git + the PR that carried it, so the
   log carries current-why only (no staleness, no read-newest-to-oldest).
3. **Design-decision vs `docs/instruction-rules-decisions.md`** — general
   hand-authored rationale vs the regenerated audit output of the
   instruction-review application (`#ai-instruction-review`). Separate,
   cross-referenced, not merged.

## Where to look (intent → record)

- *Why is the system designed this way?* → a [`docs/design-decisions/`](../design-decisions/)
  file (linked from the relevant reference spec, or named in a comment at the
  code site it constrains).
- *What does the system do now, and how?* → the [reference spec](./).
- *What happened in this unit of work, and why then?* → its PR body, reached by
  `git blame` → commit → PR. The working spec is gone by then, deliberately: it
  was branch scratch, not a record.
- *What does decision X affect?* → grep its slug across `docs/` (one-way linking
  is deliberate; no reverse index is maintained — see Boundary 1).

**Citing a past unit of work.** A shipped unit has no committed spec to link, so
cite it by date and name and mark it unlinked: *the 2026-06-09 review-board unit
(in git history)*. Use that one form — the phrasing is the only handle a reader
has, and several variants of it read as several conventions. It is a deliberate
dead end: git makes the contents recoverable, not discoverable, so anything from
that unit still worth acting on belongs in a register rather than behind the
citation.

This model is governed by the `#ai-plan`, `#swe-reference-spec`,
`#swe-design-decisions`, and `#swe-epic` rules under [`instructions/`](../../instructions/), and its
rationale is recorded in [`docs/design-decisions/records-architecture.md`](../design-decisions/records-architecture.md).

Its counterpart is [`documentation-layout.md`](./documentation-layout.md): this
document says **which record answers what**, that one says **where a folder's
location lives versus its lifecycle**. The Directory column above is a reader's
convenience — the authoritative path for every `docs/` folder is the layout map
(`#swe-docs-layout`), per that standard.
