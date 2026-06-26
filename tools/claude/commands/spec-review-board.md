---
description: Run the adversarial spec auto-review loop on a spec.
argument-hint: <spec-path>
---

Run the spec auto-review on the spec at: $ARGUMENTS

Use the `spec-review-board` skill. If no path was given, ask which spec to review. Then drive the review rounds per the skill: spawn the `spec-specialist` reviewer each round, maintain the finding ledger and ephemeral scratch under `.agentsmith/tmp/spec-review/<spec-dir-name>/` (the same directory name as the spec under `docs/working-specs/`), apply the convergence guard, and stop to ask me how to proceed on stall or the 5-round cap.
