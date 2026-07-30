# #git-pr-body PR description

A PR body **MUST** contain at minimum:

1. **What changed** -- a concise summary of the diff's intent.
2. **Why** -- the motivation or issue it addresses, and related issues.
   State the unit's **approved scope and acceptance signal inline**, not as a link: a working spec is uncommitted branch scratch (#ai-plan), so there is nothing to link to and the PR body is the unit's only durable record.
   When a deviation (#ai-plan-deviation) changes scope after the PR is open, update this section then -- original scope, the revision, and why -- so the record does not go stale against what shipped.
   That account is prose, not a verbatim before/after diff; the in-session deviation pause is what catches the change as it happens.
3. **Verification** -- the concrete steps taken: the commands run and any test output, or, when untestable, the explicit statement #swe-done requires of an untestable unit of work. Not a bare "it works".
4. **Model** (AI-authored PRs only) -- the model(s) used, per #git-usage.
5. **Reviewer notes** (optional) -- anything reviewers should scrutinize, and any follow-up deferred to #swe-future-work.
