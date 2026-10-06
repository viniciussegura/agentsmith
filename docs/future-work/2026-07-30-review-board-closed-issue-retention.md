# Review-board closed-issue retention policy

## What

The code-review board (`#ai-review-board`) moves issues to `closed/` and keeps them there indefinitely; whether that store is ever pruned, by age, by round distance, or not at all, was deferred and never settled.
If it is pruned, the pruning is a human command, never the agent: the issue store is the only local record of what a round found, and an agent deleting its own findings is the failure mode the split-owner lifecycle exists to prevent.

## Why it matters

Indefinite retention was the safe v1 default, not a decision.
The store is per-machine (`.agentsmith/review-board/`, gitignored), so unbounded growth costs disk and slows the reconcile step that reads prior issues each round, and nothing signals when that becomes a problem.

## Constraints

- Promotion to the external tracker is the durable record, so a pruned local issue is not lost work; that is what makes pruning defensible at all.
- A prune must not break the compositional-id guarantee: ids are never reused, so a pruned id must not be reissued.
- `duplicated` and `superseded` issues reference a canonical id; pruning the canonical one would dangle those references.
