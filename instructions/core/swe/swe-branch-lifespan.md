# #swe-branch-lifespan Branch lifespan

A long branch rarely grows by one decision to overreach: each new unit of work _feels_ like a continuation of the current one, and no single step is obviously the wrong call.

**Replacement is not the signal.**
A branch that throws out work it previously built is usually doing the right thing; the alternative is accreting on top of a design already known to be wrong.
Work is shipped only once the branch merges to the default branch -- until then it is work-in-progress and may be **completely** refactored.
An `Implemented` working spec only means that the code was written, not that the design was right.

Two distinct events, easily conflated, govern whether a spec is edited or replaced (#ai-plan):

- **Revision** of the unit currently being executed edits its spec in place; understanding improves during implementation, and the document should say so.
- **Revisit** of an abstraction a prior unit on this branch already settled mints a **new** spec directory. The earlier one is superseded, never edited, and becomes read-only at that moment -- editing it instead would leave no new artifact, so the count below would silently read low.

A superseded directory is retained until the branch ships.
That is not "reviewable history": the store is gitignored, so it never reaches a diff, a PR, or the default branch -- it is a local counter, which is what the revisit check needs and all it needs.
Corrections to present truth go to the reference spec (#swe-reference-spec), never to a superseded spec.

**Width is not the signal either.**
A branch spanning multiple components is _justified_ for as long as one component is still teaching the others what shape to be.
Splitting along the component seam produces PRs with no independent value, and forces the co-refinement to happen across PR boundaries instead of inside one branch.

**Convergence is the signal.**
Before minting a new working spec on a branch that already carries one, stop and classify it.
A branch converges while each new unit of work closes more than it opens; the two checks below are how that is observed (a spec may be both):

- **It adds new scope.** The branch is becoming a release train: before minting, ask whether the work already here forms a slice that could ship on its own (_When to ship_, conditions 1-2).
  If it does, ship it and start the new scope on a fresh branch.
- **It revisits an earlier working spec on this branch.** Revision is expected and healthy, but count the revisits of the same abstraction.
  The directories under `.agentsmith/specs/<branch>/` are the observable artifacts; what is counted is those concerning the **same abstraction**, not the branch's total.
  Three units on three unrelated abstractions are three directories and zero revisits -- a bare directory count would fire the stop signal below on any third unit.
  Which directories concern the same abstraction is a judgement, and the one this check turns on.
  The first two revisits are learning: supersede the earlier working spec and continue, carrying no failed attempt forward as reviewable history.
  From the third, the problem itself is not yet understood, and another attempt in the same direction only compounds an unsure foundation.
  Stop adding to it and re-examine the premise -- what the abstraction is for, and which constraint keeps breaking it -- surfacing that to the user before further work on it.

**When to ship.**
The branch, or a candidate slice of it, is ready only if all three hold:

1. it carries value independently (not merely as scaffolding for the unshipped part);
2. it is correct -- you do not expect to revise it (revision is free inside the branch and disqualifying at the boundary);
3. it is complete (#swe-done holds for it as a branch of its own).

Ship when the feedback loop has closed: the part that has stopped teaching you things ships; the part still being learned continues on a new branch off the updated default.
If no such slice exists -- the unfinished part is load-bearing for everything else -- the split is unavailable and work should continue.
Say so and shorten the remaining work rather than force a boundary that is not there.

**What is not evidence.**

- A working spec, or a plan step within it, was reviewed: a review conducted inside the wrong foundation confirms nothing.
- Tests pass: incomplete tests, or tests written against the wrong foundation, confirm nothing.
- Commit count: granularity is free and branches are squash-merged (#git-branch-workflow).
