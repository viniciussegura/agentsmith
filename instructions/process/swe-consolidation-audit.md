# #swe-consolidation-audit Consolidate before closing out a branch

A branch delivered with several design decisions accretes surface that no single commit is responsible for removing.
Before declaring done, run an explicit **consolidation audit** over the whole branch diff -- not a spot-check, and not a repeat of individual reviews (no individual review catches this, because within each commit the diff is correct):

- **Dead surface.**
    Remove unnecessary code that the final design no longer reads (_e.g._ wire fields, DB columns, enum values, and config keys).
    Verify by checking for _consumption_, not definitions -- a field with only a generated-type declaration and test fixtures referencing it is dead.
- **Re-invented workarounds.**
    The same missing capability worked around in several places independently.
    Symptom: N call sites with near-identical comments each justifying a local loop or shim.
    The fix is one shared capability, not N comments.
- **Consolidate live documents.**
    Live docs (_i.e._ documentation that reflects the current repository state, such as future work, technical debts, reference specs, and ADRs) **MUST** be left asserting the branch's final position.
    The staleness this catches is **self-inflicted** and invisible to a per-change drift check (#swe-docs-drift): a doc accurate when written, falsified by a later commit on the same branch, so no single change ever made it stale.
    A record superseded on the branch that minted it is rewritten in place, never chained (#swe-design-decisions).
    When one doc is amended, its counterpart on the other side of a cross-reference **MUST** assert the updated position.

Verify every finding against the code before reporting it (_e.g._ by grep), and prefer a failing-first signal (a query count, a failing assertion) over "tests still pass".

Cost is a single audit pass; the alternative is shipping the accretion and discovering it much later, when the context that explains it is gone.
