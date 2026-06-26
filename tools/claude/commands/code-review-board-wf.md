---
description: Run a code-review-board round via the deterministic Workflow driver (Claude Code only; same store/schema as /code-review-board).
---

Run one code-review-board round using the Workflow driver instead of the main-loop orchestrator.

1. Do the **Setup** exactly as `code-review-board` SKILL.md step 1 (resolve mode/target/baseline/roles, confirmation gate). Write the resolved `ReviewRoundInfo` to `.agentsmith/tmp/review-board/<round-id>/round.json`.
2. Build the round args with `codeArgs({ roundId, store: "<abs>/.agentsmith/review-board", scratch: "<abs>/.agentsmith/tmp/review-board/<round-id>", subjectRef, candidateLenses: <selected roles> })` from `round-args.mjs`. Invoke the `Workflow` tool with `scriptPath` = the installed `.claude/skills/code-review-board/board-round.mjs` and `args` = that object.
3. When the workflow completes, do SKILL.md step 6 (Present): summarize the round, the verify-reject count, scratch paths, and offer `/review-promote`.

This produces an identical store to `/code-review-board` via the same `persist.mjs`; it differs only in that orchestration runs as a deterministic script with no main-loop model ingesting findings. Requires the Claude `Workflow` tool; on hosts without it, use `/code-review-board`.
