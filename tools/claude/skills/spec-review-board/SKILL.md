---
name: spec-review-board
description: Run an adversarial auto-review on a spec before it becomes a plan. Use when the user accepts a spec auto-review offer, or asks to review/harden/critique a spec, or runs /spec-review-board. A generalist routes to and converges a curated fan-out of domain specialists; guard.mjs drives the finding ledger and convergence guard.
---

# Spec auto-review

Harden a spec through adversarial review rounds until it converges or the loop escalates to the user.
Implements the `#ai-spec-review` protocol -- the third application of the role-based review engine (`#ai-review-engine`), at spec altitude.

## When to run

- The user opts in to the auto-review you offered after proposing a spec, or
- the user invokes `/spec-review-board <spec-path>`, or asks to review/harden/critique a spec.

Confirm the target spec path before starting.

## Roles

- **Author / Driver** -- you, the orchestrating agent. You revise the spec and write rebuttals (judgment), and you dispatch sub-agents, execute the generalist's routing directive, and run `guard.mjs` (mechanical). The host forbids a sub-agent spawning sub-agents, so *you* dispatch both the generalist and the specialists -- the generalist routes, you execute.
- **Generalist reviewer** -- the `spec-specialist` sub-agent, spawned fresh each round (independent critique). It owns the cross-cutting lens (coherence/contradiction/testability/scope, subsuming `swe`+`correctness`), **converges** the consulted specialists' findings into the one round review, and emits the next round's routing directive. It is the engine's reduce, run in-loop. Run it on a **strong** model.
- **Specialists** -- `review-<role>` sub-agents for each consulted curated lens (`roles.yaml` `spec_review: true`). Each applies its domain lens to the spec, reconciles its prior findings, and answers the generalist's directed questions. Run them **cheap and parallel**.

Per `#ai-conversational`, every sub-agent dispatch states an explicit model id (specialists the cheapest tier that meets the bar; the generalist a model capable of sustained critical reasoning).
Where sub-agents are unavailable, one agent role-plays the generalist and each consulted lens sequentially, emitting the same artifacts with the stance switch explicit (`#ai-review-engine` degradation); where `guard.mjs` is unavailable, compute the guard by hand from the ledger.

## Definitions

- **Round** = one specialist fan-out + generalist converge, followed by one author revision-and-rebuttal. The round cap counts these.
- **Cycle** = a continuous run of rounds on one spec; the round count and the guard's `best` are **per cycle**. Substantially revising a spec after a prior cycle converged/stalled/capped starts a **new cycle** (signal it with `guard.mjs --new-cycle`).
- **Finding** = one issue with a **stable id**, an `origin` (`generalist` or a `<role>`), and a `tag` (**blocking**/**nit**). See `finding-format.md`.
- **Ledger** = `ledger.json`, the running findings list with `status` and `tagHistory`; `guard.mjs` owns it.
- `b(n)` = open-blocking count after review `n` (tag `blocking` ∧ status `open`), computed by `guard.mjs`.

## Scratch

Write every artifact under `.agentsmith/tmp/spec-review/<spec-dir-name>/` (gitignored, never committed), where `<spec-dir-name>` is the spec's own directory name under `docs/working-specs/`:

- `routing-<n>.json` -- the directive consumed by round `n` (round 1: your bootstrap; round `n>=2`: the generalist's directive from round `n-1`).
- `snapshots/<role>.md` -- the spec as lens `<role>` last saw it (for the dirtiness diff).
- `findings/<role>.json` -- one per consulted specialist (`new` + `reconcile`).
- `round-<n>.review.json` -- the generalist's converged review.
- `routing-<n+1>.json` -- the generalist's next-round routing directive.
- `round-<n>.rebuttal.json` -- your per-finding statuses.
- `ledger.json` -- the ledger `guard.mjs` reads/writes.

Shapes are in `finding-format.md`. Only the **final spec** is persisted at its normal path; never commit the scratch.

## Loop

For each round `n` starting at 1:

1. **Select specialists.** Read `routing-<n>.json` (round 1: write the bootstrap `routing-1.json` first -- pick lenses whose domain the spec touches, biasing to include when unsure, with empty `questions`). Re-intersect `lenses` with the curated `spec_review: true` set. **First-consult detection is by snapshot presence:** a lens with no `snapshots/<role>.md` is a first consult (no diff); a lens with one is a re-consult -- compute the diff `snapshots/<role>.md` vs the current spec and pass it (the snapshot is per-consult, so a skip-then-reconsult correctly diffs against the last consult).
2. **Specialist fan-out** (parallel, cheap). Spawn each consulted `review-<role>` with: the spec, its prior findings + the rebuttal/ledger, its directed questions, the diff (re-consults only), and the spec-review altitude framing. Each writes `findings/<role>.json` (`new` + `reconcile`, `origin` set) and returns a path + count. Then overwrite each consulted lens's `snapshots/<role>.md` to the current spec.
3. **Generalist converge** (strong, fresh). Spawn `spec-specialist` with: the spec, `n`, the prior rebuttal + ledger, every `findings/<role>.json`, and the curated menu. It writes `round-<n>.review.json` (converged, generalist-set tags, origins preserved, `tagReason` on any down-tag) + `routing-<n+1>.json`, and returns a path + open-blocking count.
4. **Guard.** Run `node guard.mjs <scratch-dir> <n>` (add `--new-cycle` only when starting a fresh cycle). It merges the review into `ledger.json`, computes `b(n)`, updates `meta`, and prints the verdict. Read the printed verdict, not the ledger internals.
5. **Act on the verdict.** `converged` -> present the final spec (open nits may remain). `stalled`/`cap` -> stop; summarize open blockers + any contested `wontfix` and ask the user how to proceed. `continue` -> step 6.
6. **Revise + rebuttal** (author, judgment). Revise the spec to address the findings; write `round-<n>.rebuttal.json` (per id: `resolved` what-changed / `wontfix` why-not). The next `guard.mjs` run folds the statuses in. Continue to round `n+1`.

## Convergence guard

`guard.mjs` evaluates, checked in this order, first match wins (unchanged from the single-reviewer loop, now reading the one converged ledger):

1. **Converged** -- `b(n) = 0`. Present the final spec.
2. **Stalled** -- two consecutive reviews in the cycle both fail to beat `best` (earliest the cycle's third review; a progress review resets the tally).
3. **Round cap** -- 5 rounds per cycle.

On stall or cap, summarize the open blocking findings and any `wontfix` the generalist contests so the user can decide.

## Token discipline

Mirrors the review-board cost design: specialists run **cheap and parallel** and return only a path + count (their prose never enters any context); the convergence-guard math runs in **`guard.mjs`**, not the model; the **strong** model is reserved for the single generalist converge (the in-loop reduce). Specialists **reconcile** (read only their prior findings + the per-consult diff) rather than re-scanning the whole spec. No summary-projection step: specialist findings are already compact JSON bounded by finding count over a curated set, so the generalist ingests them directly. The author's irreducible judgment spans are the spec revision and the rebuttal.
