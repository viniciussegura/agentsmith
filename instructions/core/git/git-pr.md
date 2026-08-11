# #git-pr PR structure

The PR **title** follows #git-title -- same format, same issue-code and outcome rules as the commit subject.

The PR **body** carries one load-bearing obligation: it states the unit's **approved scope** inline, because a working spec is uncommitted branch scratch (#ai-plan) and nothing else durably records it.
Inline means *stated*, not *transcribed* -- the scope in a sentence, not the spec pasted in.

Around that, the body is a summary a reviewer reads once, not an archive they excavate (#code-prose).
It holds the following, in order, and nothing else:

1. **What and why** -- a short paragraph of prose, no heading and no bullets, carrying the approved scope above and any later revision to it.
2. **Linked artifacts** -- one bullet per related record (issue, ticket, technical debt, future-work note, epic entry), formatted `<action verb> <reference>`: `fixes #123`, `pays off docs/technical-debts/2026-07-30-scratch-spec-loss.md`.
   Omit the section when there are none.
3. **Verification** -- one line, and **only** when the unit invoked #swe-done's untestable exception: the blocker it named, and the verification actually performed in place of tests.
   Omitted in every other case, because the tests ran: where CI reports them on the PR a body line restating a green check is a second copy that goes stale (#code-prose), and where there is no CI the local run is already #swe-done's gate.
4. **Reviewer notes** (optional) -- what a reviewer should scrutinise, and any question the PR leaves open.
   These live in the body, not a review comment, because a PR evolves: the body is revised as the answer changes, while a comment scrolls out of view and is never corrected.
5. **Authorship** (AI-authored PRs only) -- one line declaring the PR was authored with AI assistance.
   Not which models did the work: that is the commit trailer's job (#git-usage), and a PR-level list goes stale the moment another model touches the branch.
