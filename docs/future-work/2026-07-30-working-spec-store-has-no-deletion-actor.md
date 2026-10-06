# The working-spec store's deletion clause names no actor

## What

`#ai-plan` says a working spec and its plan are deleted when the branch ships, is explicit that this is neither a `#swe-done` gate nor reachable by that rule's temporary-artifact sweep, and names nobody who performs the deletion.
The trigger has no observer: `#git-branch-workflow` assigns the squash-merge to the human, the branch is usually deleted right after, and no agent session is present when the rule fires, so `.agentsmith/specs/` accretes on every machine.
Recommended: an `#ai-session-hygiene` prompt that, when a session starts on a branch whose predecessor has merged, offers to sweep stores for branches no longer present in `git branch`; cheap, no new surface, and it puts the actor where an agent actually is.
Alternatives: a CLI verb (`agentsmith specs prune --merged`), explicit and testable but new public surface with its own docs obligation; or reword the clause as opportunistic cleanup and let the store grow, honest but leaving the rule describing an event with no actor.

## Why it matters

The rule concedes the outcome ("an orphaned directory harms nothing"), which makes the deletion clause close to decorative.
The accretion removed from version control reappears locally, invisibly, and a reused branch name inherits a stranger's directories, which `2026-07-30-scratch-spec-loss.md` also notes; the revisit count itself stays correct, because the branch key scopes it.

## Constraints

- Any sweep keys off branch existence, not age: an unmerged long-lived branch's specs are live work, and deleting them is the failure `2026-07-30-scratch-spec-loss.md` records.
- Deletion stays off the `#swe-done` path; a gate would fail a PR for un-swept scratch.
- `#ai-plan`'s clause and the chosen mechanism must agree: the defect is a rule asserting a behaviour nothing implements, the same shape as `2026-07-31-install-does-not-surface-the-gitignore-requirement.md`.
