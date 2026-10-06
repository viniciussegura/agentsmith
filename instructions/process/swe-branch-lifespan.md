# #swe-branch-lifespan Branch lifespan

A long branch rarely overreaches by one decision: each new unit of work feels like a continuation of the current one.
Of the signals below, only convergence decides when a branch ships.

**Replacement is not the signal.**
Work is shipped only once the branch merges to the default branch; until then it may be **completely** refactored, and an `Implemented` working spec means the code was written, not that the design was right.
Two events govern whether a spec is edited or replaced (#ai-plan): a **revision** of the unit being executed edits its spec in place; a **revisit** of an abstraction a prior unit on this branch settled mints a **new** spec directory, and the earlier one becomes read-only, never edited, since editing it would leave no artifact for the count below.
Superseded directories are retained until the branch ships; the store is gitignored (#ai-plan), so they are a local counter, not reviewable history.
Corrections to present truth go to the reference spec (#swe-reference-spec), never to a superseded spec.

**Width is not the signal.**
A branch spanning several components is justified while one component is still teaching the others what shape to be; splitting at the seam produces PRs with no independent value.

**Convergence is the signal.**
Before minting a new working spec on a branch that already carries one, stop and classify it; a branch converges while each unit closes more than it opens.

- **It adds new scope.** Ask whether the work already on the branch is a slice that could ship on its own (*When to ship*, conditions 1-2); if so, ship it and start the new scope on a fresh branch.
- **It revisits an earlier working spec.** Count the revisits of the **same abstraction**: a judgement over the directories under `.agentsmith/specs/<branch>/`, never a bare directory count.
  The first two revisits are learning: supersede and continue.
  From the third, the problem is not yet understood: stop adding to it, re-examine the premise -- what the abstraction is for and which constraint keeps breaking it -- and surface that to the user before further work on it.

**When to ship.**
The branch, or a candidate slice of it, is ready only if all three hold:

1. it carries value independently, not merely as scaffolding for the unshipped part;
2. it is correct -- you do not expect to revise it;
3. it is complete (#swe-done holds for it as a branch of its own).

The part that has stopped teaching you things ships; the part still being learned continues on a new branch off the updated default.
If no such slice exists, say so and shorten the remaining work rather than force a boundary that is not there.

**What is not evidence.** A reviewed spec or plan step, passing tests, and commit count: each confirms nothing about the foundation, and commits are squashed anyway (#git-branch-workflow).
