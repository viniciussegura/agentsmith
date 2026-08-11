# #git-pr PR structure

The PR **title** follows #git-title -- same format, same issue-code and outcome rules as the commit subject.

The PR **body** is a summary a reviewer reads once, not an archive they excavate (#code-prose).
It holds the following, in order, and nothing else:

1. **What and why** -- about three sentences of prose, no heading and no bullets.
   State the unit's approved scope inline: a working spec is uncommitted branch scratch (#ai-plan), so this is the only durable record of what the unit set out to do.
   Inline means *stated*, not *transcribed* -- the scope in a sentence, not the spec pasted in.
2. **Linked artifacts** -- one bullet per related record (issue, ticket, technical debt, future-work note, epic entry), formatted `<action verb> <reference>`: `fixes #123`, `pays off docs/technical-debts/2026-07-30-scratch-spec-loss.md`.
   Omit the section entirely when there are none.
3. **Verification** -- one line naming the command run and its result, or, when the unit is untestable, the statement #swe-done requires and the blocker it names. Never a bare "it works".
4. **Model** (AI-authored PRs only) -- the model ids used, per #git-usage. One line.

Items 3 and 4 are one line each by design: they are gate evidence, and a gate is checkable or it is not.
Item 1 is where the reader's attention goes, so it is the only item that gets prose.

When a deviation (#ai-plan-deviation) changes scope after the PR is open, revise item 1 then, so the record does not go stale against what shipped.
An epic-planned unit also has an epic entry (#swe-epic), but that holds the *plan*; it never substitutes for item 1, which holds the *outcome*.
Reviewer notes, open questions, and follow-ups deferred to #swe-future-work go in a review comment -- they are conversation, not record.
