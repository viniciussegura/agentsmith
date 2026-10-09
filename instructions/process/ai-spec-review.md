# #ai-spec-review Spec auto-review

After writing or substantially revising a working spec (#ai-plan), offer an adversarial auto-review and wait for the user's choice; never start one unprompted.
The review engine's third application (#ai-review-engine): a generalist routes and converges a curated specialist fan-out, the author revises and rebuts each round, and a deterministic guard decides converged, contested, stalled, or capped.
The review hardens the spec and never approves it: approval stays the user's (#ai-plan); on stall, cap, or a contested `wontfix` it stops and asks the user.
Reviews and rebuttals are ephemeral scratch under `.agentsmith/tmp/`, never committed.
The ledger, authority split, cycle rules, and guard are defined in the `review-board-protocol` reference-spec document (#swe-docs-layout) and the spec-review skill.
