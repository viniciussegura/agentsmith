# #ai-instruction-review Instruction review

The review engine's second application (#ai-review-engine): run the shared round over an instruction set itself, each role proposing missing or weak rules through its lens, not code issues; the maintainer is `ai-engineer`.
A round is a full audit, never a diff, and opens with the ownership coverage lint, since no lens covers an unowned rule.
It proposes and never edits: proposals land in a per-machine worksheet, a human records a decision per proposal, and a separate apply step applies only those.
The one committed output is the decisions log, `docs/instruction-rules-decisions.md`, so later rounds neither re-litigate nor re-raise.
The rubric, proposal schema, worksheet, and scorecard are defined in the `review-board-protocol` reference-spec document (#swe-docs-layout) and the instruction-review skill.
