---
name: spec-review
description: Run an adversarial auto-review on a spec before it becomes a plan. Use when the user accepts a spec auto-review offer, or asks to review/harden/critique a spec, or runs /spec-review. Drives review rounds with a spec-specialist reviewer, rebuttals, a finding ledger, and a convergence guard.
---

# Spec auto-review

Harden a spec through adversarial review rounds until it converges or the loop escalates to the user.
Implements the `#ai-spec-review` protocol.

## When to run

- The user opts in to the auto-review you offered after proposing a spec, or
- the user invokes `/spec-review <spec-path>`, or asks to review/harden/critique a spec.

Confirm the target spec path before starting.

## Roles

- **Author** -- you, the orchestrating agent. You revise the spec and write rebuttals.
- **Reviewer** -- the `spec-specialist` subagent, spawned fresh each round so the critique is independent. Where sub-agents are unavailable, switch to the reviewer stance yourself each round, emitting both artifacts with the stance switch explicit.

## Definitions

- **Round** = one reviewer review followed by one author revision-and-rebuttal. The round cap counts these.
- **Cycle** = a continuous run of rounds on one spec. The round count and the guard's `best` are **per cycle**. Substantially revising a spec after a prior cycle converged/stalled/capped starts a **new cycle** (reset the round count and `best`), even if you keep numbering rounds upward for continuity.
- **Finding** = one issue, tagged **blocking** or **nit**, carrying a **stable id** reused verbatim when the issue recurs. See `finding-format.md`.
- **Ledger** = the running list of findings with status `open` / `resolved` / `wontfix`. The guard reads the ledger, not a raw per-round count.
- `b(i)` = open-blocking count after review `i` (a finding counts as open only if its status is `open`).

## Scratch

Write every artifact under `.agentsmith/tmp/spec-review/<spec-dir-name>/` (gitignored, never committed), where `<spec-dir-name>` is the spec's own directory name under `docs/working-specs/` (e.g. `2026-06-09-review-board`) so the scratch folder matches the spec folder exactly:

- `round-<n>.review.md`, `round-<n>.rebuttal.md`, and `ledger.md`.

Only the **final spec** is persisted at its normal path. Do not commit the scratch.

## Loop

For each round `n` starting at 1:

1. Spawn the `spec-specialist` reviewer via the Task tool, passing: the spec path, `n`, and (for `n >= 2`) the previous `round-<n-1>.rebuttal.md` and `ledger.md`. Save its output to `round-<n>.review.md` and update the ledger ids/tags.
2. Compute `b(n)` from the ledger. Evaluate the **convergence guard** (below). If it stops the loop, act on it and exit.
3. Otherwise, as author: read the current review, the current spec, and the ledger; revise the spec to address the findings; write `round-<n>.rebuttal.md` marking each finding `resolved` (what changed) or `wontfix` (why not); update the ledger.
4. Continue to round `n+1`.

## Convergence guard

Track `best` = the lowest `b` across all **prior** reviews **in the current cycle** (undefined before the cycle's first review). Check in this order; first match wins. Update `best := min(best, b(n))` only **after** the checks. On a new cycle, reset `best` and the cycle's round count.

1. **Converged** -- `b(n) = 0`. Stop; present the final spec. Open nits may remain in the ledger.
2. **Stalled** -- a review makes progress when `b(n)` is strictly below `best` (the cycle's first review always counts as progress). Stall fires when two consecutive reviews in the cycle both fail to make progress (earliest the cycle's third review); a progress review resets the tally. Stop; ask the user how to proceed.
3. **Round cap** -- at most 5 rounds **per cycle**. On reaching it without convergence, stop; ask the user how to proceed.

On stall or cap, summarize the open blocking findings and any `wontfix` the reviewer contests so the user can decide.
