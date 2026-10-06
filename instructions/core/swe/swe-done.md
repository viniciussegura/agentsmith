# #swe-done Definition of done

A **unit of work** is done at its own gate: a working spec reaching `Implemented` (`#ai-plan`, process bundle), or a request line closed in `annotated.md` (#ai-multiple-requests).
The branch's **deliverable** is done when every unit in it is done and the branch items hold; do not open or update a PR before both hold.

**Per unit of work**, as each lands:

1. The unit is complete as raised; a partial delivery counts only when the narrowing was surfaced and accepted (`#ai-plan-deviation`).
2. Its tests pass locally.
   Where none exist, the verification actually performed and its specific blocker are recorded (#git-pr, #swe-technical-debts), and a harness the runtime makes straightforward is established first (#swe-testing).
3. Documentation drift it caused is resolved (#swe-docs-drift, #swe-reference-spec, #swe-entity, #swe-design-decisions).
4. New shortcuts are recorded (#swe-technical-debts), deferred work logged (#swe-future-work), and new deferral markers dated (#swe-dated-todos).
5. It has been self-reviewed against these instructions.

**Per branch**, before the PR:

1. Branch consolidation is done (`#swe-consolidation-audit`, process bundle) when the branch carries more than one unit and one required a working spec.
2. Unused dependencies are pruned (#swe-deps).
3. A non-trivial diff (any criterion from `#ai-plan`) has had an independent review pass (#ai-review-board) before it squash-merges; self-review is the floor, never the substitute.
4. Temporary artifacts the session created and the change does not ship are removed; durable stores (`.agentsmith/specs/`, `.agentsmith/review-board/`) stay, and an unclear case is asked about, never guessed.

An AI agent carries further items (#ai-done) and, on finishing, follows #ai-session-hygiene.
