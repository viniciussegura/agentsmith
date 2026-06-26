# Live Workflow smoke test for board-round.mjs

The unified `board-round.mjs` driver is fully unit-covered via an injected
dispatcher, but the live Workflow-runtime path — the `typeof agent === 'function'`
import-guard plus the conditional top-level `await runRound(...)` — was not
exercised during implementation (subagents call `runRound` directly, bypassing the
guard).

**Deferred:** a post-merge smoke test that actually invokes `/code-review-board-wf`
(and, once exercised, `/spec-review-board-wf` and `/agentsmith-instruction-review-board-wf`)
on a real round, confirming the guard fires under the Workflow runtime and the
round produces the expected per-board store. If the runtime rejects the
import-guard shape, split into `board-round.mjs` (live script) + `round-body.mjs`
(exports `runRound`) per the board-unification plan's Task 2 note.

Source: board-unification whole-branch review (2026-06-26), flagged acceptable for
merge, not a blocker.
