# persistCmd / reducePrompt interpolate paths unquoted

`tools/claude/skills/code-review-board/round-args.mjs` builds `persistCmd` (and the
code `reducePrompt`) by interpolating `ctx.store` / `ctx.scratch` / `ctx.roundId`
into a shell command string without quoting, e.g.
`node .claude/skills/code-review-board/persist.mjs apply ${ctx.store} ${ctx.roundId}`.

If an absolute path contains a space, the agent that runs the command would
shell-split it into extra arguments.

**Accepted because:** this is carried over verbatim from the deleted `workflow.mjs`
(not a regression), the repo's own paths contain no spaces, and the executor is an
LLM agent that can quote. Low risk.

**Fix when convenient:** quote the interpolations (`"${ctx.store}"`) in the
`round-args.mjs` builders, or document that `store`/`scratch`/`roundId` must be
shell-safe. Source: board-unification per-task + whole-branch reviews (2026-06-26).
