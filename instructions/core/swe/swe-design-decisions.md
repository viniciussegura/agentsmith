# #swe-design-decisions Design decisions

The design-decisions log records *why* the system is as it is now: the standing rationale for choices that bind work beyond the unit that introduced them, the reference spec's WHY counterpart (#swe-reference-spec).
A decision file is the choice, the alternatives rejected, and what would reopen it, written per #code-prose.
One file per decision under the design-decisions directory (#swe-docs-layout), created when the first cross-cutting decision is warranted, **never** preemptively.
A decision file is **kept, mutable, and self-replacing**: no `Status:` line, no date in the name, edited in place, deleted when abandoned.
Past rationale lives in git and the PR body (#git-pr); the log never accretes superseded entries.
Scope by reach: a choice that binds other work, or that a future contributor would re-litigate, earns a file, always at project scope.
Below that threshold, a non-obvious constraint goes in a comment at the site it constrains (#code-style), and deliberation about a shipped choice goes in the PR body and nowhere else.
Present-truth documents link **out** by slug; a decision never enumerates its referrers, so grep its slug to find what it affects.
A comment at a code site a decision constrains **names the decision's slug**; before writing a bare constraint comment, grep the design-decisions directory for the subject, and such comments follow a renamed or deleted file (#swe-docs-drift).
Distinct from `docs/instruction-rules-decisions.md`, the instruction-review audit output (`#ai-instruction-review`).
The done gate (#swe-done) only keeps existing files current; authoring a new one is a soft #ai-session-hygiene prompt, never a gate.
