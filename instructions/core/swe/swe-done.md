# #swe-done Definition of done

Done has two altitudes.
A **unit of work** is done at its own gate: a working spec reaching `Implemented` (#ai-plan), or a request landed without one -- a trivial change that skipped the spec (#ai-plan), or a line closed in `annotated.md` (#ai-multiple-requests).
The branch's **deliverable** is done when every unit of work in it is done and the branch items below hold.
Do not open or update a PR before both tiers hold.

**Per unit of work.** Checked as each one lands.

1. The unit is complete as raised.
   A partial delivery is done only when the narrowing was surfaced and accepted (#ai-plan-deviation).
2. Tests for the unit pass locally.
   When the repo has no test harness, or the unit is genuinely untestable, the verification actually performed is stated and recorded (#git-pr-body, #swe-technical-debts): "done" is never "it compiled."
   Invoking the untestable exception **requires naming the specific blocker** (e.g. "no test harness exists", "purely declarative config with no executable path") -- "hard to test" or "not worth testing" do not qualify.
   If the blocker is an absent harness and the language/runtime makes one straightforward to establish, the exception is unavailable until it is established (#swe-testing).
3. Documentation drift the unit caused is resolved (#swe-docs-drift), including the reference spec when current behavior changed (#swe-reference-spec), the entity model when the schema changed (#swe-entity), and the design-decisions log when the unit altered an existing decision's rationale (#swe-design-decisions).
4. New shortcuts or limitations are recorded (#swe-technical-debts); deferred work is logged (#swe-future-work).
   Any new in-code deferral marker carries a date per #swe-dated-todos.
5. The unit has been self-reviewed against these instructions.

**Per branch.** Checked once, before the PR.

1. Branch consolidation is done (#swe-consolidation-audit), when the branch carries more than one unit of work and at least one of them required a working spec (#ai-plan).
2. Unused dependencies are pruned (#swe-deps).
3. The working-specs index is current (#ai-plan) -- `agentsmith spec-index --check` passes.
4. A **non-trivial diff** -- one that meets any criterion from #ai-plan -- has had a deliberate, independent review pass (#ai-review-board) before it squash-merges to the default branch.
   Per-item self-review is the floor, never the substitute.
5. Temporary artifacts the session created but the change does not ship (scratch files, throwaway worktrees, ad-hoc output or log directories) are removed.
   Outputs that are deliberately persisted are not temporary and stay: anything the change is meant to produce, plus durable stores a workflow writes by design.
   When it is unclear whether an artifact is throwaway or wanted, ask the user before deleting rather than guessing.

An AI agent carries further items on top of these (#ai-done).
Separately, on finishing the work, also follow #ai-session-hygiene -- a reminder to capture session learnings, not a merge gate.
