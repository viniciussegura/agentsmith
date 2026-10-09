# #ai-review-board Code-review board

On request, run the shared review round (#ai-review-engine) over the repo state or a branch-vs-default-branch diff; each role raises structured issues through its lens, and the `project-manager` maintainer writes a prioritized triage report (#code-prose).
The board is a triage layer on top of the team's tracker, never a replacement: an issue reaches team work only when a human promotes it into the tracker, and that promotion is the human validation of the AI-raised finding.
The board's store is local-first under `.agentsmith/review-board/`, gitignored and per-machine; the tracker is the only durable, shared record.
Lens gating, baseline derivation, issue ids, and the issue lifecycle are defined in the `review-board-protocol` reference-spec document (#swe-docs-layout) and the board skill.
