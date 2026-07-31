# The working-spec store's deletion clause names no actor

Date: 2026-07-30

## What

`#ai-plan` says a working spec and its plan are deleted when the branch ships, and is explicit that this is **not** a `#swe-done` gate and **not** reachable by that rule's temporary-artifact sweep. Nothing else names who performs the deletion or when.

The trigger has no observer. `#git-branch-workflow` assigns the squash-merge to the human, and the branch is usually deleted right after, so no agent session is present at the moment the rule fires. The net effect is that `.agentsmith/specs/` accretes indefinitely on every machine.

## Why it matters

The rule concedes the outcome ("an orphaned directory harms nothing"), which is honest but makes the deletion clause close to decorative -- it describes an event that in practice nobody triggers. Two costs follow:

- The accretion this change removed from version control reappears locally, just invisibly. That is a far smaller problem -- gitignored, per-machine, never read by the rules -- but it is the same shape, and the rule reads as if it were solved.
- `#swe-branch-lifespan`'s revisit count reads directories under the current branch's key. Stale directories from branches that shipped long ago do not affect *that* branch's count (the key scopes it), so the signal stays correct; but a reused branch name inherits a stranger's directories, which the scratch-spec-loss debt already notes.

## Options

1. **An `#ai-session-hygiene` prompt.** When a session starts on a branch whose predecessor has merged, offer to sweep stores for branches no longer present in `git branch`. Cheap, needs no new surface, and puts the actor where an agent actually is.
2. **A CLI verb** -- `agentsmith specs prune --merged`, deleting store directories whose branch is gone. The installer already has manifest-bounded deletion machinery to model it on, and it is explicit and testable. Costs new public surface with its own docs obligation (`#swe-public-surface-docs`).
3. **Accept and say so plainly.** Reword the clause so it reads as opportunistic cleanup rather than a triggered event, and let the store grow.

Option 1 is the cheapest thing that makes the clause true. Option 3 is honest and costs nothing but leaves the rule describing an event with no actor.

## Constraints

- Any sweep must key off branch existence, not age: an unmerged long-lived branch's specs are live work, and deleting them is the failure mode `2026-07-30-scratch-spec-loss.md` already records.
- Deletion must stay off the `#swe-done` path. It is deliberately not a gate, and making it one would fail a PR for un-swept scratch, which is exactly the pointless-blocker outcome the current wording avoids.
- Whichever option lands, `#ai-plan`'s clause and the chosen mechanism must agree -- the defect here is precisely a rule asserting a behaviour nothing implements.

## Provenance

Raised in review of the 2026-07-30 ephemeral-working-specs branch, alongside the observation that the store's gitignored status was likewise asserted but not established (documented on that branch, not enforced -- see `2026-07-31-install-does-not-surface-the-gitignore-requirement.md`; this was neither).
