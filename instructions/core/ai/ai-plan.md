# #ai-plan Specs and plans

- A unit of work lives in one directory, `docs/working-specs/<YYYY-MM-DD>-<slug>/`, holding `spec.md` and/or `plan.md`.
  The directory may hold only `spec.md` (no plan yet) or only `plan.md` (trivial work that skipped a spec).
- Each file carries a `Status:` line that is exactly one bare token: `Draft`, `Approved`, or `Implemented`.
- A spec or plan is append-only once `Approved` -- its body is frozen, though the `Status:` line may still advance to `Implemented`; corrections to the live system go to the reference spec (#swe-reference-spec), **never** back into the artifact that predates them.
- Work is **non-trivial** -- requiring a user-approved spec before a plan is written or executed -- when it meets any of: touches more than one file with distinct purposes; introduces or removes public surface (#swe-public-surface-docs); or cannot be stated in a single sentence. 
  A self-evidently-correct single-file edit or rename may skip the spec.
- Non-trivial changes start with a user-approved spec before a plan is written and executed.
