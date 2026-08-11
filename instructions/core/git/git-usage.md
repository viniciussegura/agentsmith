# #git-usage Authorship reporting

- AI commits add a trailer after `Co-Authored-By:`: `Usage: model=<model-id>` (e.g. `claude-opus-4-7[1m]`).
  Multiple models: `model=claude-opus-4-7; subagents=claude-sonnet-4-6 x3`.
  The `Co-Authored-By:` line names the same (or dominant) model.
- The trailer is repeated on the **squash commit** (#git-branch-workflow), which is the only commit that survives on the default branch.
  A trailer carried only by branch commits is collapsed away at the squash, leaving the shipped history with no attribution at all.
  The PR body carries none of this (#git-pr): the commit is the one home.
- No token or time figures in git -- they cannot be reliably sourced and go stale.
  Track spend in the project's own cost tooling instead of recording it in history.
- For how to invoke git safely (non-interactive flags, upstream setup, hook policy), see #git-tooling.
