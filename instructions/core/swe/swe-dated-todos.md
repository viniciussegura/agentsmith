# #swe-dated-todos Dated deferral markers

Every in-code deferral marker carries the date it was written, inside the tag: `TODO(2026-06-11): ...`, `FIXME(2026-06-11): ...` (likewise `BUG`, `HACK`, `XXX`).
The date records the marker's age, not a due date -- it lets a later reader or reviewer judge staleness without `git blame`, which a squash-merge (#git-branch-workflow) collapses to a single commit.
A marker that implies real follow-up work belongs in `docs/future-work/` (#swe-future-work) or a technical-debt note (#swe-technical-debts), not left to rot in code.
