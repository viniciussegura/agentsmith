# #git-pr PR structure

The PR **title** follows #git-title -- same format, same issue-code and outcome rules as the commit subject.

The PR **body** carries one load-bearing obligation: it states the unit's **approved scope** inline.
Inline means *stated*, not *transcribed* -- the scope in a sentence, not the spec pasted in.

Around that, the body is a summary a reviewer reads once, not an archive they excavate (#code-prose).
It holds the following, in order, and nothing else:

1. **What and why** -- a short paragraph of prose, no heading and no bullets, carrying the approved scope above.
2. **Linked artifacts** -- one bullet per related record (issue, ticket, technical debt, future-work note, epic entry), formatted `<action verb> <reference>`: `fixes #123`, `pays off docs/technical-debts/2026-07-30-scratch-spec-loss.md`.
   Omit the section when there are none.
3. **Reviewer notes** (optional) -- what a reviewer should scrutinise, and any question the PR leaves open.
   These live in the body, not a review comment, because a PR evolves: the body is revised as the answer changes, while a comment scrolls out of view and is never corrected.
4. **Authorship** (AI-authored PRs only) -- one line declaring the PR was authored with AI assistance.
   Not which models did the work: that is the commit trailer's job (#git-usage), and a PR-level list goes stale the moment another model touches the branch.

The body carries **no verification section**: CI runs the tests and reports on the PR, so a line restating a green check is a second copy that goes stale (#code-prose).
CI's one gap is a unit that invoked #swe-done's untestable exception -- there is no test for CI to run, so item 1 names the blocker, because nothing else records it.
