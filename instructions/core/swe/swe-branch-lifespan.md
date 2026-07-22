# #swe-branch-lifespan Branch lifespan

A long branch rarely grows by one decision to overreach.
It grows because each new unit _feels_ like the next wave of the current one, and no single step is obviously the wrong call.

**Replacement is not the signal.**
A branch that throws out work it previously built is usually doing the right thing; the alternative is accreting on top of a design already known to be wrong.
Changes are considered shipped only after the branch is merged to the default branch -- changes done in the branch are considered work-in-progress and may be **completely** refactored.
Revising an `Implemented` working spec is **not** an ending signal, but a refactor one: `Implemented` records that the code was written, not that the design was right.
A rule that fires on revision taxes the one behavior that keeps a branch honest, and leaves no legal move between "build on top" and "replace".

**Width is not the signal either.**
A branch spanning multiple components is *justified* for as long as one component is still teaching the others what shape to be.
Splitting that along the component seam produces PRs with no independent value and forces the co-refinement to happen across PR boundaries instead of inside one branch.

**Convergence is the signal.**
The signal is that the branch has stopped **converging**: a new unit opens more questions than it closes.
Before minting each new spec, verify working specs already in the branch diff.
A spec may do both -- apply both checks:

- If the new spec covers new features, the branch can be a release train -- evaluate against "When to ship" below.
- If the new spec revisits previous specs, this is a strong refactor indicator that previous decisions should be revised to avoid accreting on top of bad decisions -- do not carry the failed attempts forward as reviewable history.
  Count revisits of the same abstraction:
  - The first two are learning -- revise in place and continue. 
  - From the third, the problem is not yet understood, and revising again just buys another wrong answer: stop and land what the learning has already produced.

**When to ship**
The branch, or a candidate slice of it, is ready to ship only if all four hold:

  1. it carries value independently (not merely as scaffolding for the unshipped part).
  2. it is correct (you do not expect to revise it -- revision is free inside the branch and disqualifying at the boundary).
  3. it is complete (#swe-done holds for it, not just the branch).
  4. it was consolidated (#swe-consolidation-audit).

Ship when the feedback loop has closed: the part that has stopped teaching you things ships; the part still being learned continues on a new branch off the updated default.
If no such slice exists -- the unfinished part is load-bearing for everything else -- the split is unavailable. 
Say so and shorten the remaining work rather than force a boundary that is not there.

**What is not evidence.**

- Spec/Wave was reviewed: if it was built on the wrong foundation/understanding, it means nothing.
- Tests are passing: if tests are not complete or built on the wrong foundation/understanding, it means nothing.
- Commit count: commit granularity is free and branches are squash-merged (#git-branch-workflow), so it is not a reliable metric.
