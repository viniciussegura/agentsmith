# #git-pr PR structure

The PR **title** follows #git-title.

The PR **body** carries one load-bearing obligation: it states the unit's **approved scope** and how it was judged done, inline -- stated in a sentence, not transcribed -- because a working spec is uncommitted branch scratch (`#ai-plan`, process bundle) and nothing else durably records either.
It holds the following, in order, and nothing else:

1. **What and why** -- a short paragraph of prose, no heading and no bullets, carrying the obligation above and any later revision to it.
2. **Breaking changes** -- present whenever the title carries `!` (#git-title), omitted otherwise: one changelog-style bullet per break, naming what breaks and what a consumer does instead; the PR's form of the commit's `BREAKING CHANGE:` footer.
3. **Linked artifacts** -- one bullet per related record (issue, ticket, debt or future-work note, epic entry), formatted `<action verb> <reference>`: `fixes #123`, `pays off <a technical-debt note>` (#swe-docs-layout).
   Omit the section when there are none.
4. **Verification** -- one line, and **only** when the unit invoked #swe-done's untestable exception: the blocker it named, and the verification actually performed in place of tests.
   Omitted otherwise (#code-prose).
5. **Reviewer notes** (optional) -- what a reviewer should scrutinise, and any question the PR leaves open; kept in the body, which is revised, not in a comment.
6. **Authorship** (AI-authored PRs only) -- one line declaring the PR was authored with AI assistance; which models did the work is the commit trailer's job (#git-usage).
