# Review-board closed-issue retention policy

Date: 2026-07-30

## What

The code-review board (`#ai-review-board`) moves issues to `closed/` and keeps them there indefinitely. Whether that store should ever be pruned -- by age, by round-distance, or not at all -- was deferred and never settled.

If it is pruned, the pruning is a **human command, never the agent**: the board's issue store is the only local record of what a round found, and an agent deleting its own findings is the failure mode the split-owner lifecycle exists to prevent.

## Why it matters

Indefinite retention was chosen as the safe v1 default, not as a decision. The store is local-first and per-machine (`.agentsmith/review-board/`, gitignored), so unbounded growth costs disk and slows the reconcile step that reads prior issues each round. Nothing currently signals when that becomes a problem.

## Constraints

- Promotion to the external tracker is the durable record (`#ai-review-board`); a pruned local issue is not lost work, which is what makes pruning defensible at all.
- Any prune must not break the compositional-id guarantee: ids are never reused, so a pruned id must not be reissued.
- `duplicated` and `superseded` issues reference a canonical id; pruning the canonical one would dangle those references.

## Provenance

Raised as an open question in the 2026-06-09 review-board unit of work and carried forward here when that unit's working spec was deleted (working specs are no longer committed -- `#ai-plan`). The original wording, and the rest of that unit's design discussion, are in git history.
