# #swe-done Definition of done

A change is done only when all of these hold:

1. Tests for the change pass locally.
   When the repo has no test harness, or the change is genuinely untestable, the verification actually performed is stated and recorded (#git-pr-body, #swe-technical-debts): "done" is never "it compiled."
   Invoking the untestable exception **requires naming the specific blocker** (e.g. "no test harness exists", "purely declarative config with no executable path") -- "hard to test" or "not worth testing" do not qualify.
   If the blocker is an absent harness and the language/runtime makes one straightforward to establish, the exception is unavailable until it is established (#swe-testing).
2. Documentation drift is resolved (#swe-docs-drift), including the reference spec when current behavior changed (#swe-reference-spec) and the entity model when the schema changed (#swe-entity).
3. Unused dependencies are pruned (#swe-deps).
4. New shortcuts or limitations are recorded (#swe-technical-debts); deferred work is logged (#swe-future-work).
5. The change has been self-reviewed against these instructions; self-review is the floor, and a non-trivial diff escalates to a deliberate, independent review pass (#ai-review-board) before it squash-merges to `main`.
6. Temporary artifacts the session created but the change does not ship -- scratch files, throwaway worktrees, ad-hoc output or log directories -- are removed.
   Outputs that are deliberately persisted are not temporary and stay: anything the change is meant to produce, plus durable stores a workflow writes by design (e.g. the review-board issue store).
   When it is unclear whether an artifact is throwaway or wanted, ask the user before deleting rather than guessing.

Do not open or update a PR before all items hold.
