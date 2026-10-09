# #ai-plan Specs and plans

- A unit of work lives in one directory at `.agentsmith/specs/<branch>/<YYYY-MM-DD>-<slug>/`, holding `spec.md` and/or `plan.md`.
  The store **MUST be gitignored**: ignore `.agentsmith/*` with `!` exceptions for whichever paths the project commits, never an enumeration of the working-state paths.
  Nothing in the generator does this for you.
  A working spec is **branch scratch and is never committed**: the unit's durable trace is its PR body (#git-pr), its standing rationale the design-decisions log (#swe-design-decisions), and its site-specific constraints comments at those sites (#code-style).
  The `<branch>` component is the branch name with every `/` **flattened to `--`** (`refactor/foo` -> `refactor--foo`), never nested.
  A directory may hold only `spec.md` (no plan yet) or only `plan.md` (trivial work that skipped a spec); work too trivial for a directory is still a unit of work, tracked as a request (#ai-multiple-requests).
- A unit of work starts on an approved feature branch (#git-branch-workflow); if not yet on one, confirm the branch first.
  Before minting a new working spec on a branch that already carries one, apply #swe-branch-lifespan.
- Each file carries a `Status:` line that is exactly one bare token: `Draft`, `Approved`, or `Implemented`.
- A spec states the outcome, the constraints, and the acceptance signal; a plan states the steps; both per #code-prose, neither narrating the deliberation behind it.
- The working spec of the unit **currently being executed is mutable**, edited in place as understanding improves.
  A **superseded** working spec -- one a later unit on the same branch replaced -- is read-only from that moment (#swe-branch-lifespan).
  Corrections to the live system go to the reference spec (#swe-reference-spec), **never** to a spec that predates them.
- A revision that alters the spec's **scope, constraints, or interface contract** is a deviation (#ai-plan-deviation) and requires re-approval.
  While re-approval is pending, `Status:` reads `Draft`, and returns to `Approved` when re-approved; a deviation found after `Implemented` reverts it to `Draft` too, which un-clears the per-unit done gate (#swe-done) until the revised spec reaches `Implemented` again.
  Re-approval restores `Approved` and nothing more.
- Work is **non-trivial** -- requiring a user-approved spec before a plan is written or executed -- when it meets any of: touches more than one file with distinct purposes; introduces or removes public surface (#swe-public-surface-docs); or cannot be stated in a single sentence.
  A self-evidently-correct single-file edit or rename may skip the spec.
- A new working spec carries a short **Conformance** section stating it conforms to the current reference spec (#swe-reference-spec) and design decisions (#swe-design-decisions), or naming where and why it diverges and whether those documents must change; the spec review (#ai-spec-review) treats a silent contradiction as blocking, and a divergence's doc updates land at #swe-done.
- A working spec and its plan are **deleted when the branch ships**: the whole `.agentsmith/specs/<branch>/` directory, one delete covering every unit on it, never per unit.
  Deleting a plan earlier, once its unit has landed, is permitted.
  Deletion is **not** a #swe-done gate, and the temporary-artifact sweep does not reach the store.
