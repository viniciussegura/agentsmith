# #git-pr PR structure

The PR **title** follows #git-title -- same format, same issue-code and outcome rules as the commit subject.

The PR **body** is a summary a reviewer reads once, not an archive they excavate (#code-prose).
It holds the following, in order, and nothing else:

1. **What and why** -- about three sentences of prose, no heading and no bullets.
   State the unit's approved scope inline: a working spec is uncommitted branch scratch (#ai-plan), so this is the only durable record of what the unit set out to do.
   Inline means *stated*, not *transcribed* -- the scope in a sentence, not the spec pasted in.
2. **Linked artifacts** -- one bullet per related record (issue, ticket, technical debt, future-work note, epic entry), formatted `<action verb> <reference>`: `fixes #123`, `pays off docs/technical-debts/2026-07-30-scratch-spec-loss.md`.
   Omit the section when there are none.
3. **Reviewer notes** (optional) -- what a reviewer should scrutinise, and any question the PR leaves open.
   These live in the body, not a review comment, because a PR evolves: the body is revised as the answer changes, while a comment scrolls out of view and is never corrected.
   Notes for *this* review only -- a deferred item is a #swe-future-work file, linked in item 2 and never restated here.

The body carries **no verification section**: CI runs the tests and reports on the PR, so a line restating a green check is a second copy that goes stale (#code-prose).
CI's one gap is a unit that invoked #swe-done's untestable exception -- there is no test for CI to run, so item 1 names the blocker, because nothing else records it.
The body carries **no authorship section** either: the model trailer is on the commits (#git-usage).
