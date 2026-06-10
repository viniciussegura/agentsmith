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

- A unit of work lives in one directory, `docs/working-specs/<YYYY-MM-DD>-<slug>/`, holding `spec.md` and/or `plan.md`.
  The directory may hold only `spec.md` (no plan yet) or only `plan.md` (trivial work that skipped a spec).
- Each file carries a `Status:` line that is exactly one bare token: `Draft`, `Approved`, or `Implemented`.
- A spec or plan is append-only once `Approved` -- its body is frozen, though the `Status:` line may still advance to `Implemented`; corrections to the live system go to the reference spec (#swe-reference-spec), never back into the artifact that predates them.
- Non-trivial changes start with a user-approved spec before a plan is written and executed.

## #ai-spec-review Spec auto-review

- After writing or substantially revising a spec (#ai-plan) under `docs/working-specs/`, offer an adversarial auto-review and wait for the user's choice; never start one unprompted.
- On opt-in, a spec-specialist reviewer and the author alternate in rounds: the reviewer writes findings (each **blocking** or nit, with a stable id), the author revises the spec and writes a rebuttal (each finding `resolved` or `wontfix`), and the next reviewer reads the current spec, the latest rebuttal, and the running ledger.
- Where the tool supports sub-agents, the reviewer is a separate agent so the critique is independent; otherwise the author takes the reviewer stance each round, or a human reviews.
- A **review cycle** is a continuous run of rounds on one spec; round numbering and the convergence guard's state (the round count and the best open-blocking count) are **per cycle, not global**. Substantially revising a spec after a prior cycle converged, stalled, or hit the cap starts a **new cycle** with the round count and best reset, even when round numbering continues for the reader's continuity.
- Convergence guard, checked after each review in this order: zero open blocking findings = converged; otherwise two consecutive reviews **within the cycle** that fail to beat the best (lowest) open-blocking count seen so far in the cycle = stalled (earliest the cycle's third review); otherwise a **5-round-per-cycle** cap.
- On stall or the cap, stop and ask the user how to proceed, summarizing the open blockers and any contested `wontfix`.
- Only the final spec is committed; per-round reviews and rebuttals are ephemeral under `.agentsmith/tmp/spec-review/<spec-dir-name>/` -- the same directory name as the spec under `docs/working-specs/` -- and are never committed.

## #ai-review-engine Role-based review engine

- A shared, opt-in review engine fans out **role-specialized reviewer sub-agents**, each a curated composition of existing instruction tags (#swe-reuse) rather than a fresh persona, so reviewers track the instruction set instead of forking it.
- One pipeline, two applications: **code review** (#ai-review-board) and a sibling instruction-review application; they share the registry and the shape, and differ only in subject, schema, persistence, and reconciliation.
- The shape is **setup -> fan-out (cheap model, parallel) -> verify (an adversarial per-finding skeptic, biased to reject) -> reduce (a strong-model editor that consolidates and writes the human-facing output) -> present**.
- Three adversarial filters gate every finding before it becomes team work: the verify stage, the reduce-stage consolidation, and a human acceptance step.
- Portable and degrades by host: real sub-agents when available, else one agent role-playing each lens sequentially, else a human supplying findings onto the same schema.

## #ai-review-board Code-review board

- On request, run the review engine (#ai-review-engine) over the current repo state or a branch-vs-default-branch diff, each role raising structured issues through its lens, then a project-manager reduce consolidates priority, groups issues into epics, and writes a prioritized triage report.
- `correctness` (behavior bugs) and `swe` (the cross-cutting base lens) **always run**; other roles are gated by the paths and commit messages the change touches, so a relevant lens is never silently skipped and an irrelevant one is not paid for.
- The board is a triage layer **on top of** the team's official tracker, not a replacement: a human promotes a board issue into the tracker, and that promotion is the human validation of the AI-raised issue.
- `baselineCommit` is always a live default-branch SHA: a feature-branch round uses `merge-base(commit, default)` (squash-safe, never chained off a branch tip); a default-branch round chains off the previous default-branch round's commit.
- Each issue has a globally-unique compositional id `<roundId>#<role>-<n>` minted by the raising round; ids are never reused, so cross-issue links stay valid forever.
- Issues move through a single-owner status lifecycle (open / promoted / fixed / deprecated / superseded / duplicated); `promoted` is not a closing status.
- Persistence is hybrid: a committed, human-readable canonical issue store (closed and promoted issues are partitioned, never agent-deleted) plus ephemeral per-run reasoning under `.agentsmith/tmp/` that is never committed.

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
