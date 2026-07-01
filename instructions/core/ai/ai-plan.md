# #ai-plan Specs and plans

- A unit of work lives in one directory under working-specs (#swe-docs-layout), holding `spec.md` and/or `plan.md`.
  The directory may hold only `spec.md` (no plan yet) or only `plan.md` (trivial work that skipped a spec).
- A working-spec directory is created on an approved feature branch (#git-branch-workflow); if not yet on one, confirm the branch first.
- Each file carries a `Status:` line that is exactly one bare token: `Draft`, `Approved`, or `Implemented`.
- A spec or plan is append-only once `Approved` -- its body is frozen, though the `Status:` line may still advance to `Implemented`; corrections to the live system go to the reference spec (#swe-reference-spec), **never** back into the artifact that predates them.
- Work is **non-trivial** -- requiring a user-approved spec before a plan is written or executed -- when it meets any of: touches more than one file with distinct purposes; introduces or removes public surface (#swe-public-surface-docs); or cannot be stated in a single sentence.
  A self-evidently-correct single-file edit or rename may skip the spec.
- Non-trivial changes start with a user-approved spec before a plan is written and executed.
- A new working spec carries a short **Conformance** section stating it conforms to the current reference spec (#swe-reference-spec) and design decisions (#swe-design-decisions), or naming where and why it diverges and whether those present-truth docs must change. The statement's home is that named section, so author and reviewer both know where to look; it is enforced by the adversarial spec review (#ai-spec-review) -- a spec that silently contradicts present-truth without justification is a blocking finding. Any divergence's doc updates are applied at #swe-done.
- A plan reaching `Implemented` **may be pruned** -- an explicit exception to the append-only rule above, for plans only (deletion, not in-place mutation), justified because a plan is execution scaffolding with no residual present-truth; the spec, the shipped code, and git carry the result. The spec is **never** pruned.
- The set of working specs is indexed at generated `docs/working-specs/INDEX.md`, regenerated on any structural change to the set -- a spec added, a spec directory deleted or renamed, a `Status:` changed, or a plan pruned. 
  The index **MUST** be current at #swe-done; how it is regenerated and drift-checked is the project's own tooling, not fixed by this rule. 
  Regeneration is mechanical upkeep, not a design step.
