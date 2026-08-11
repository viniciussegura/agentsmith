# #ai-plan Specs and plans

- A unit of work lives in one directory at `.agentsmith/specs/<branch>/<YYYY-MM-DD>-<slug>/`, holding `spec.md` and/or `plan.md`.
  The store **MUST be gitignored** -- ignore `.agentsmith/` as a whole (or `.agentsmith/*` with `!` exceptions for the generated instructions, where those are committed), never an enumeration of the working-state paths: the set grows, and a list that must stay complete is the shape that silently misses the next addition.
  Nothing in the generator does this for you, so in a project that has not, the guarantees below do not hold and the corpus this rule exists to prevent will accumulate in version control.
  Given that, a working spec is **branch scratch and is never committed**, so the unit's durable trace is its PR body (#git-pr), its standing rationale the design-decisions log (#swe-design-decisions), and its site-specific constraints comments at those sites (#code-style).
  The `<branch>` component attributes each directory to the branch that created it, with every `/` **flattened to `--`** (`refactor/foo` -> `refactor--foo`), so the component is always one path segment.
  It must not nest: nesting makes one branch's store a subdirectory of another's whenever one name prefixes another, so deleting `refactor/` at ship would destroy `refactor/foo`'s in-flight specs, and the revisit count below would read a sibling branch's units as its own.
  The directory may hold only `spec.md` (no plan yet) or only `plan.md` (trivial work that skipped a spec).
  Work trivial enough to carry no directory at all is still a unit of work, tracked as a request rather than a spec (#ai-multiple-requests).
- A unit of work is started on an approved feature branch (#git-branch-workflow); if not yet on one, confirm the branch first.
  Before minting a new working spec on a branch that already carries one, apply #swe-branch-lifespan -- the branch may be due to ship rather than to grow.
- Each file carries a `Status:` line that is exactly one bare token: `Draft`, `Approved`, or `Implemented`.
- A spec and a plan are written per #code-prose.
  A spec states the outcome, the constraints, and the acceptance signal; a plan states the steps. Neither narrates the deliberation that produced it -- that is what the approving conversation was for.
- The working spec of the unit **currently being executed is mutable**: it is edited in place as understanding of the unit improves, because forbidding the author to correct it only drives the correction into the reader's head instead of the document.
  A **superseded** working spec -- one that a later unit on the same branch replaced -- becomes read-only at the moment it is superseded (#swe-branch-lifespan).
  Corrections to the live system go to the reference spec (#swe-reference-spec), **never** to a spec that predates them.
- A revision that alters the spec's **scope, constraints, or interface contract** is a deviation (#ai-plan-deviation) and requires re-approval; this rule holds that threshold's wording, and #ai-spec-review references it.
  While a re-approval is pending, `Status:` reads `Draft`, and returns to `Approved` when re-approved -- the token states whether the *current* text is approved, not whether some earlier text once was.
  A deviation-worthy revision discovered after `Status:` reads `Implemented` reverts it to `Draft` as well, which **un-clears** the per-unit done gate (#swe-done); that gate re-clears only when the revised spec reaches `Implemented` again.
  Re-approval restores `Approved` and nothing more: it does not re-declare the unit landed, because the redone work has not been executed at that point.
- Work is **non-trivial** -- requiring a user-approved spec before a plan is written or executed -- when it meets any of: touches more than one file with distinct purposes; introduces or removes public surface (#swe-public-surface-docs); or cannot be stated in a single sentence.
  A self-evidently-correct single-file edit or rename may skip the spec.
- Non-trivial changes start with a user-approved spec before a plan is written and executed.
- A new working spec carries a short **Conformance** section stating it conforms to the current reference spec (#swe-reference-spec) and design decisions (#swe-design-decisions), or naming where and why it diverges and whether those present-truth docs must change. The statement's home is that named section, so author and reviewer both know where to look; it is enforced by the adversarial spec review (#ai-spec-review) -- a spec that silently contradicts present-truth without justification is a blocking finding. Any divergence's doc updates are applied at #swe-done.
- A working spec and its plan are **deleted when the branch ships**: the branch's `.agentsmith/specs/<branch>/` directory is removed, one delete covering every unit on it.
  Deletion is keyed to the branch shipping, never to a unit landing -- on a branch carrying several units, a per-unit trigger would delete an earlier unit's directory mid-branch and destroy the record #swe-branch-lifespan counts.
  Deleting a plan earlier, once its unit has landed, is permitted and ungated: nothing reads it.
  Deletion is **not** a #swe-done gate, and the temporary-artifact sweep does not reach the store (#swe-done): it is gitignored scratch with its own trigger, so an orphaned directory harms nothing.
