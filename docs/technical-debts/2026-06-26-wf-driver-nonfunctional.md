# The -wf Workflow drivers are non-functional under the runtime

`tools/claude/skills/code-review-board/board-round.mjs` and the three `-wf`
commands (`code-review-board-wf`, `spec-review-board-wf`,
`instruction-review-board-wf`) do **not** run under the real Workflow runtime.
A live smoke test (2026-06-30) hit cascading failures: `export const meta` not
first, a forbidden second `export`, forbidden `import`, and `args` not arriving as
passed. Details + the rework brief:
[`docs/future-work/2026-06-26-board-round-live-smoke.md`](../future-work/2026-06-26-board-round-live-smoke.md).

The unit tests pass because they import `runRound` directly and never load the file
as a Workflow script — false confidence.

**Working path meanwhile:** the **main-thread driver** (the board SKILLs, where the
main-loop agent follows the round steps and dispatches subagents) does not use
`board-round.mjs` and is unaffected. `round-args.mjs` (builders, `runOuterLoop`) is
pure and tested. installer-prune works.

**Until fixed:** treat the `-wf` deterministic drivers as experimental / not
shipping; use the main-thread `/agentsmith:code-review-board` (etc.) path.

Discovered while verifying board-unification before merge (PR #13, held as draft).
