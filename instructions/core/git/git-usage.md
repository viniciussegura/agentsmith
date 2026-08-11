# #git-usage Authorship reporting

- AI commits add a trailer after `Co-Authored-By:`: `Usage: model=<model-id>` (e.g. `claude-opus-4-7[1m]`).
  Multiple models: `model=claude-opus-4-7; subagents=claude-sonnet-4-6 x3`.
  The `Co-Authored-By:` line names the same (or dominant) model.
- The trailer must reach the **squash commit**, the only one that survives on the default branch; the human doing the squash carries it across, which is where that step is stated (#git-branch-workflow).
  The PR body declares AI authorship but names no model (#git-pr): the trailer is the one home for which models did the work.
- No token or time figures in git -- they cannot be reliably sourced and go stale.
  Track spend in the project's own cost tooling instead of recording it in history.
- For how to invoke git safely (non-interactive flags, upstream setup, hook policy), see #git-tooling.
