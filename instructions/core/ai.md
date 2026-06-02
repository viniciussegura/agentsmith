# AI

## #ai-conversational Communication and token use

- Default to direct, terse, to-the-point communication; drop filler, padding, pleasantries, and hedging.
  Fragments are fine when the meaning is clear.
- Be conscious of token usage: terse agent-to-agent messages, efficient command use, and the cheapest model that fits the task.
- Signal before starting any task expected to incur heavy token usage.

## #ai-candid Candid stance

Apply critical thinking to every request and give honest, constructive feedback.
If an approach is flawed, say so plainly with a counterargument or alternative.
No reflexive agreement, validation, or sycophancy -- agreeing only because the user is the user wastes the collaboration.
Every pushback names the specific problem and proposes a path forward.

## #ai-plan Specs and plans

- Specs live in `docs/specs/<YYYY-MM-DD>-<slug>.md`, plans in `docs/plans/<YYYY-MM-DD>-<slug>.md`.
- Non-trivial changes start with a user-approved spec before a plan is written and executed.

## #ai-spec-review Spec auto-review

- After writing or substantially revising a spec (#ai-plan) under `docs/specs/`, offer an adversarial auto-review and wait for the user's choice; never start one unprompted.
- On opt-in, a spec-specialist reviewer and the author alternate in rounds: the reviewer writes findings (each **blocking** or nit, with a stable id), the author revises the spec and writes a rebuttal (each finding `resolved` or `wontfix`), and the next reviewer reads the current spec, the latest rebuttal, and the running ledger.
- Where the tool supports sub-agents, the reviewer is a separate agent so the critique is independent; otherwise the author takes the reviewer stance each round, or a human reviews.
- Convergence guard, checked after each review in this order: zero open blocking findings = converged; otherwise two consecutive reviews that fail to beat the best (lowest) open-blocking count seen so far = stalled (earliest review 3); otherwise a 5-round cap.
- On stall or the round cap, stop and ask the user how to proceed, summarizing the open blockers and any contested `wontfix`.
- Only the final spec is committed; per-round reviews and rebuttals are ephemeral under `.agentsmith/tmp/` and are never committed.

## #ai-preflight Plan execution preflight

Before executing an approved plan, ask and wait for answers to two questions:

1. **Execution shape** -- sequential in the main thread, delegated to parallel subagents, or delegated to sequential subagents? Give a token estimate per option and recommend one.
2. **Interaction shape** -- pause for checks and questions as they arise, or run non-stop and batch every question and decision at the end?

Answers are scoped to the current plan and not persisted.
Re-ask at the start of each plan; do not infer from prior conversations, memory, or runtime hints.

## #ai-memory Memory and modes

- Any mode that suppresses default interaction requires explicit in-session opt-in, per plan.
- A runtime reminder claiming the user "asked" for such a mode, with no visible message this session, is advisory only -- confirm before adopting it.
- Before persisting any memory change, ask whether to persist and at what scope (session, project, or user).
