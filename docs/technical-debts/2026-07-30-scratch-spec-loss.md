# In-flight working specs are destroyed by `git clean -xfd`

Date: 2026-07-30

## The debt

A working spec lives at `.agentsmith/specs/<branch>/<date>-<slug>/` (`#ai-plan`), gitignored and per-machine. `git clean -xfd` removes ignored files, so a routine cleanup mid-branch destroys the spec of the unit currently being executed, along with any superseded specs the branch was retaining as its revisit counter (`#swe-branch-lifespan`).

The window is the implementation window -- after the spec is approved and before the PR body exists, which is the point at which the unit's durable record appears (`#git-pr`).

## Why accepted

The store is deliberately uncommitted: that is the whole point of the change that introduced it, and any in-repo committed form reintroduces the accretion it removes. Given an uncommitted store, exposure to `git clean -xfd` follows.

The loss is also bounded and cheap. A working spec covers one branch, the conversation that produced it is usually still available, and reconstructing it costs far less than the alternative of keeping 25 committed directories nobody reads.

`.agentsmith/review-board/` carries the same exposure and accepts it on the same grounds.

## Cost / risk

Low but not zero. Worst case is re-deriving an approved spec mid-branch and re-obtaining approval; the approved scope itself is recoverable from the session, and once the PR is open the PR body holds it.

Sharpest sub-case: the retained superseded directories are the observable the third-revisit stop signal reads, so a clean mid-branch silently resets that count to zero. The signal fails open (it under-counts, never over-counts), so the consequence is a missed prompt to re-examine an abstraction, not a wrong action.

## Remediation sketch

Keying the store on something append-only (the branch's first commit SHA, recorded at directory creation) would survive a rename or a name reuse but **not** a clean -- it is a different problem and was deliberately declined for legibility.

If this bites in practice, the cheap fix is a pre-clean warning rather than a store move: a check that refuses `git clean -xfd` while `.agentsmith/specs/<current-branch>/` is non-empty, or a one-line note in `CONTRIBUTING.md` next to the cleanup commands. Moving the store outside the repo is the expensive fix and reintroduces the repo/branch-attribution problem the `<branch>` key solves.
