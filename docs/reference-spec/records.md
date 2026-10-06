# Records

How this repository organizes its records.
Governed by `#swe-reference-spec`, `#swe-design-decisions`, `#swe-epic`, `#swe-future-work`, `#swe-technical-debts`, and `#ai-plan`; the rationale is in [`records-architecture.md`](../design-decisions/records-architecture.md).
A member of the reference spec: it reflects the model as it is **now** and carries no `Status:` line.

Two families: **present-truth** is mutable, self-replacing, kept current, never stale; **point-in-time** is dated and removed when discharged.
Where each record lives is the layout map, `#swe-docs-layout` ([`swe-docs-layout.md`](../../instructions/core/swe/swe-docs-layout.md)), keyed by the owner tag below.

| Record | Owner rule | Family | Mutability | Answers |
| --- | --- | --- | --- | --- |
| Design decision | `#swe-design-decisions` | present-truth | mutable, self-replacing | **WHY** the system is as it is, now |
| Reference spec | `#swe-reference-spec` | present-truth | mutable, self-replacing | WHAT and HOW the system is, now |
| Epic | `#swe-epic` | present-truth\* | mutable; deleted when its last unit ships | the delivery **plan** for multi-deliverable work, now |
| Future-work | `#swe-future-work` | point-in-time | removed when done | what we deferred |
| Technical-debt | `#swe-technical-debts` | point-in-time | removed when paid | what we compromised |

\* An epic is present-truth by mutability, edited in place and never frozen, but holds a provisional plan rather than shipped truth (`#swe-epic`).

The working spec is not a record: it is gitignored branch scratch at `.agentsmith/specs/<branch>/<date>-<slug>/`, deleted when the branch ships, and a unit's durable trace is its PR body (`#ai-plan`, `#git-pr`).
Decisions and reference-spec documents link many-to-many and one way: a present-truth document links out to a decision by slug, and a decision does not enumerate its referrers.

## Where to look

Reading:

- *Why is the system designed this way?* -> a design-decision file, linked from the relevant reference-spec document or named in a comment at the code site it constrains.
- *What does the system do now, and how?* -> the reference spec.
- *What happened in this unit of work, and why then?* -> its PR body, reached by `git blame`, then the commit, then the PR.
- *What does decision X affect?* -> grep its slug across `docs/`; no reverse index is kept.

Writing:

- Deferred or out-of-scope work -> `#swe-future-work`.
- An accepted shortcut or known limitation -> `#swe-technical-debts`.
- Rationale below the reach test of `#swe-design-decisions` -> a comment at the site it constrains (`#code-style`), or the PR body.

## Location versus lifecycle

A record type's location and naming pattern live once, in the layout map (`#swe-docs-layout`); its lifecycle (when a file is created, what it states, when it is deleted, who consults it) lives in the owner rule, which cites the map and never restates the path.
A project remaps a row's location through `.agentsmith/docs-layout.yaml` ([`docs-layout-config.md`](./docs-layout-config.md)).

## Citing a past unit of work

A shipped unit has no committed spec to link, so cite it in prose, in this order and with nothing between the date and the name:

> the **2026-06-09** *review-board unit* **(in git history)**

Three required elements: the unit's `YYYY-MM-DD` date, its name, and the literal marker `(in git history)` closing the citation.
The marker is the handle -- it is what a reader recognizes and what a grep finds -- so it is fixed text, always parenthesized, never split from the name it follows.
The noun is prose: *unit*, *audit*, *landing* all read fine, and forcing one word on all of them costs more than it buys.
A section or part reference goes inside the marker, after it: `(in git history, §A)`.

The citation is a deliberate dead end.
Git makes the contents recoverable, not discoverable, so anything from that unit still worth acting on belongs in a register, not behind the citation.
