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
- **Finding** = one issue, tagged **blocking** or **nit**, carrying a **stable id** reused verbatim when the issue recurs. See `finding-format.md`.
- **Ledger** = the running list of findings with status `open` / `resolved` / `wontfix`. The guard reads the ledger, not a raw per-round count.
- `b(i)` = open-blocking count after review `i` (a finding counts as open only if its status is `open`).

## Scratch

Write every artifact under `.agentsmith/tmp/spec-review/<slug>/` (gitignored, never committed):

- `round-<n>.review.md`, `round-<n>.rebuttal.md`, and `ledger.md`.

Only the **final spec** is persisted at its normal path. Do not commit the scratch.

## Loop

For each round `n` starting at 1:

1. Spawn the `spec-specialist` reviewer via the Task tool, passing: the spec path, `n`, and (for `n >= 2`) the previous `round-<n-1>.rebuttal.md` and `ledger.md`. Save its output to `round-<n>.review.md` and update the ledger ids/tags.
2. Compute `b(n)` from the ledger. Evaluate the **convergence guard** (below). If it stops the loop, act on it and exit.
3. Otherwise, as author: read the current review, the current spec, and the ledger; revise the spec to address the findings; write `round-<n>.rebuttal.md` marking each finding `resolved` (what changed) or `wontfix` (why not); update the ledger.
4. Continue to round `n+1`.

## Convergence guard

Track `best` = the lowest `b` across all **prior** reviews (undefined before review 1). Check in this order; first match wins. Update `best := min(best, b(n))` only **after** the checks.

1. **Converged** -- `b(n) = 0`. Stop; present the final spec. Open nits may remain in the ledger.
2. **Stalled** -- a review makes progress when `b(n)` is strictly below `best` (review 1 always counts as progress). Stall fires when two consecutive reviews both fail to make progress (earliest review 3); a progress review resets the tally. Stop; ask the user how to proceed.
3. **Round cap** -- at most 5 rounds. On reaching it without convergence, stop; ask the user how to proceed.

On stall or cap, summarize the open blocking findings and any `wontfix` the reviewer contests so the user can decide.
