# #git-pr PR structure

The PR **title** follows #git-title -- same format, same issue-code and outcome rules as the commit subject.

The PR **body** carries one load-bearing obligation: it states the unit's **approved scope** and how it was judged done, inline, because a working spec is uncommitted branch scratch (#ai-plan) and nothing else durably records either.
Inline means *stated*, not *transcribed* -- the scope in a sentence, not the spec pasted in.

Around that, the body is a summary a reviewer reads once, not an archive they excavate (#code-prose).
It holds the following, in order, and nothing else:

1. **What and why** -- a short paragraph of prose, no heading and no bullets, carrying both halves of the obligation above and any later revision to them.
2. **Breaking changes** -- present whenever the title carries `!` (#git-title), omitted otherwise: one changelog-style bullet per break, naming what breaks and what a consumer does instead.
   It sits directly under item 1 because it is the highest-stakes thing the body can say and the reader may stop early (#code-prose); being rarely present, promoting it costs nothing when absent.
   This is the PR's form of the commit's `BREAKING CHANGE:` footer, not a second copy of it -- the footer stays on the commit and rides the squash.
3. **Linked artifacts** -- one bullet per related record (issue, ticket, technical debt, future-work note, epic entry), formatted `<action verb> <reference>`: `fixes #123`, `pays off docs/technical-debts/2026-07-30-scratch-spec-loss.md`.
   Omit the section when there are none.
4. **Verification** -- one line, and **only** when the unit invoked #swe-done's untestable exception: the blocker it named, and the verification actually performed in place of tests.
   Omitted in every other case, because the tests ran: where CI reports them on the PR a body line restating a green check is a second copy that goes stale (#code-prose), and where there is no CI the local run is already #swe-done's gate.
5. **Reviewer notes** (optional) -- what a reviewer should scrutinise, and any question the PR leaves open.
   These live in the body, not a review comment, because a PR evolves: the body is revised as the answer changes, while a comment scrolls out of view and is never corrected.
6. **Authorship** (AI-authored PRs only) -- one line declaring the PR was authored with AI assistance.
   Not which models did the work: that is the commit trailer's job (#git-usage), and a PR-level list goes stale the moment another model touches the branch.
