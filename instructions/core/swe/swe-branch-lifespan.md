# #swe-branch-lifespan Branch lifespan

A long branch rarely grows by one decision to overreach: each new unit _feels_ like the next step of the current one, and no single step is obviously the wrong call.

**Replacement is not the signal.**
A branch that throws out work it previously built is usually doing the right thing; the alternative is accreting on top of a design already known to be wrong.
Work is shipped only once the branch merges to the default branch -- until then it is work-in-progress and may be **completely** refactored, including one whose working spec is `Implemented`: that status records that the code was written, not that the design was right.
An earlier **working** spec is superseded by a new one, never edited; corrections to present truth go to the reference spec (#ai-plan).

**Width is not the signal either.**
A branch spanning multiple components is _justified_ for as long as one component is still teaching the others what shape to be.
Splitting along the component seam produces PRs with no independent value, and forces the co-refinement to happen across PR boundaries instead of inside one branch.

**Convergence is the signal.**
The branch has stopped converging when a new unit opens more questions than it closes.
Before minting a new working spec on a branch that already carries one, stop and classify it -- a spec may be both, so apply both checks:

- **It adds new scope.** The branch is becoming a release train: evaluate it against _When to ship_ below before minting.
- **It revisits an earlier working spec on this branch.** Revision is expected and healthy, but count the revisits of the same abstraction.
  The first two are learning: supersede the earlier working spec and continue, carrying no failed attempt forward as reviewable history.
  From the third, the problem itself is not yet understood, and another attempt in the same direction only compounds an unsure foundation.
  Stop adding to it and re-examine the premise -- what the abstraction is for, and which constraint keeps breaking it -- surfacing that to the user before further work on it.
  Whatever part of the branch does not rest on that abstraction is evaluated against _When to ship_ on its own.

**When to ship.**
The branch, or a candidate slice of it, is ready only if all four hold:

1. it carries value independently (not merely as scaffolding for the unshipped part);
2. it is correct -- you do not expect to revise it (revision is free inside the branch and disqualifying at the boundary);
3. it is complete (#swe-done holds for it, not just for the branch);
4. it was consolidated (#swe-consolidation-audit).

Ship when the feedback loop has closed: the part that has stopped teaching you things ships; the part still being learned continues on a new branch off the updated default.
If no such slice exists -- the unfinished part is load-bearing for everything else -- the split is unavailable.
Say so and shorten the remaining work rather than force a boundary that is not there.

**What is not evidence.**

- A working spec, or a step within it, was reviewed: a review conducted inside the wrong foundation confirms nothing.
- Tests pass: incomplete tests, or tests written against the wrong foundation, confirm nothing.
- Commit count: granularity is free and branches are squash-merged (#git-branch-workflow).
