# #code-prose Artifact prose

Every artifact this set asks you to write -- a PR (#git-pr), a design decision (#swe-design-decisions), a reference-spec document (#swe-reference-spec), a working spec or plan (#ai-plan), an epic entry (#swe-epic), a technical-debt or future-work note (#swe-technical-debts, #swe-future-work), a code comment (#code-style), a `README` or any other doc (#swe-docs-drift) -- is read once, under time pressure, by someone answering one question.
Write for that reader: direct, terse, to-the-point.

- **Lead with the answer**, then its support: a reader who stops after the first sentence still gets the point.
- **One claim per sentence.** Cut throat-clearing ("it is worth noting that"), hedging that carries no information, and any restatement of the sentence before it.
- **Pick one form.** Prose when the order of ideas carries meaning, a list when the items are parallel, a table when they share fields -- never two forms for the same content.
- **Omit an empty section** rather than filling it. Length is not evidence of rigor, and an artifact nobody finishes has recorded nothing.
- **Do not restate what a neighbouring artifact holds** -- name it and move on. Each fact has one home (#swe-reuse); a copy is a second thing to keep current (#swe-docs-drift).

Terseness is a budget on words, **never** on content: an artifact that drops a constraint, a rejected alternative, or a named blocker to hit a length is not terse, it is incomplete.
When the two collide, completeness wins and the prose gets tighter instead -- cut the telling, not the told.

This rule governs prose; #code-markdown governs its formatting, and #ai-conversational the agent's own conversational register.
Where another rule sets an explicit budget for one artifact (e.g. #git-pr's three sentences), that budget is this rule applied, not an addition to it.
