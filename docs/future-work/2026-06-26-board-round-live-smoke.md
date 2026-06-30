# Rework the board-round.mjs Workflow driver against the real runtime

A live smoke test (2026-06-30) proved the board-unification **Workflow `-wf` driver
is non-functional under the actual Workflow runtime**. The unit tests passed only
because they import `runRound` with a stubbed dispatcher and never load
`board-round.mjs` as a Workflow script. This is the rework brief.

## Runtime constraints discovered (a Workflow script MUST obey all)

1. **`export const meta = {...}` must be the FIRST statement.** Current
   `board-round.mjs` has it after `runRound` → `SyntaxError: export const meta must
   be the FIRST statement`.
2. **No second `export`.** `export async function runRound` →
   `SyntaxError: Unexpected keyword 'export'`. The runtime evals everything after
   `meta` in a non-module scope. The body must be a LOCAL (non-exported) function or
   inline.
3. **No `import` — static or dynamic.** `import { x } from './y.mjs'` →
   `Unexpected token '{'`; `await import('./y.mjs')` →
   `Error: import() is not available in workflow scripts`. The script must be
   **fully self-contained** (this matches the original `workflow.mjs`, which was
   meta + inline body, no functions/imports/2nd-export).
4. **`args` did not arrive as passed.** After making the script self-contained
   (meta-first + local `runRound` + guard — which DOES load and run), the round
   died at the first use of `args` (`candidateLenses` undefined, `agent_count: 0`).
   The mechanism by which the Workflow `args` input reaches the script's `args`
   global needs to be established — the design assumed a kickstart-via-args contract
   that the smoke run did not confirm. The structured-output `plan` return
   (`agent(prompt, {schema})`) is also unverified end-to-end.

## What this means for the design

- The clean split (`board-round.mjs` Workflow shim + tested `round-body.mjs`) is
  **impossible** (no import). Options: (a) self-contained `board-round.mjs` with a
  local `runRound` + a byte-sync test against an exported `round-body.mjs` twin;
  (b) generate `board-round.mjs` by inlining a tested source at `bin/cli.js` time
  with a drift test (the agentsmith generate+drift pattern); (c) drop the `-wf`
  Workflow driver entirely and keep only the main-thread driver (the SKILL prose),
  which needs none of this.
- Resolve constraint 4 first (how `args` reach the script; whether structured
  output works in a Workflow) — it determines whether the whole `-wf` approach is
  viable, before reshaping the file.

## Verification gate for the rework

A `-wf` board is "done" only when a **live** `Workflow({scriptPath: board-round.mjs, args})`
runs a real round end-to-end (plan returns lenses → fan-out → reduce → persist)
and writes the expected per-board store — not when unit tests pass.

The main-thread driver, `round-args.mjs` builders, `runOuterLoop`, installer-prune,
the renames, and the docs are unaffected and sound.
