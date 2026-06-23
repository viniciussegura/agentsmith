# #git-usage Authorship reporting

- AI commits add a trailer after `Co-Authored-By:`: `Usage: model=<model-id>` (e.g. `claude-opus-4-7[1m]`).
  Multiple models: `model=claude-opus-4-7; subagents=claude-sonnet-4-6 x3`.
  The `Co-Authored-By:` line names the same (or dominant) model.
- AI PR bodies note the model(s) used.
- No token or time figures in git -- they cannot be reliably sourced and go stale.
  Track spend in tooling (`/cost`, `rtk gain`) instead.
