---
description: Run a role-based code-review round over the current state or a branch-vs-default-branch diff.
argument-hint: [--full-sweep] [<branch>]
---

Run a code-review board round. Arguments: $ARGUMENTS

Use the `review-board` skill. Parse the arguments: `--full-sweep` forces full-sweep mode (re-examine the whole project); an optional `<branch>` names the feature branch to review (default: the current branch vs the configured default branch).

Then drive the round per the skill, in this order: Setup (resolve mode/target, select roles from `.agentsmith/review-board/config.yaml`, run the dirtiness scan, and present the confirmation gate incl. the `baselineCommit` choice), then fan out the selected role reviewers in parallel where each role **reconciles prior issues in its lens and raises new findings in one fused pass**, then verify each new finding adversarially (one-time-at-entry, new findings only), then persist the verified findings and reconciled transitions to the local `.agentsmith/review-board/` store, then run the `review-pm` reduce to group epics and write `triage.md`, and finally present the round -- including the count of findings verify rejected and where their scratch transcripts are. Offer to promote selected issues with `/review-promote`.
