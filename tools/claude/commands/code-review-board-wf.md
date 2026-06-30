---
description: Run a code-review-board round via the deterministic Workflow driver (Claude Code only; same store/schema as /code-review-board).
---

Run one code-review-board round using the Workflow driver instead of the main-loop orchestrator.

1. Do the **Setup** exactly as `code-review-board` SKILL.md step 1 (resolve mode/target/baseline/roles, confirmation gate). Write the resolved `ReviewRoundInfo` to `.agentsmith/tmp/review-board/<round-id>/round.json`.
2. **Snapshot the pre-round git state** for the containment guard (reviewers carry the Write tool): run `node .claude/skills/code-review-board/round-guard.mjs snapshot .agentsmith/tmp/review-board/<round-id>/git-baseline.txt`. This is the baseline the driver's final **Guard** phase checks; `codeArgs` defaults `guardBaseline` to exactly this path.
3. Build the round args with `codeArgs({ roundId, store: "<abs>/.agentsmith/review-board", scratch: "<abs>/.agentsmith/tmp/review-board/<round-id>", subjectRef, candidateLenses: <selected roles> })` from `round-args.mjs`. Invoke the `Workflow` tool with `scriptPath` = the installed `.claude/skills/code-review-board/board-round.mjs` and `args` = that object.
4. When the workflow completes, **read the Guard phase result**: a non-zero `round-guard check` exit means an agent wrote outside the gitignored scratch/store — stop, report the offending paths, and do not present results until reconciled. On a clean guard, do SKILL.md step 6 (Present): summarize the round, the verify-reject count, scratch paths, and offer `/review-promote`.

This produces an identical store to `/code-review-board` via the same `persist.mjs`; it differs only in that orchestration runs as a deterministic script with no main-loop model ingesting findings. Requires the Claude `Workflow` tool; on hosts without it, use `/code-review-board`.
