# Board unification: one round choreography, two drivers, three boards

Status: Draft

## Problem

agentsmith has three applications of the role-based review engine
(`#ai-review-engine`), and each orchestrates differently:

- **spec-review** (`spec-review-board`) — a generalist (`spec-specialist`)
  routes to and converges a curated specialist fan-out; the **main thread**
  dispatches, runs `guard.mjs`, and loops rounds to convergence. This is already
  close to the target shape.
- **code-review** (`code-review-board`) — the **main thread** selects roles from
  `config.yaml`, dispatches reviewers, verifies, persists, and runs the
  `review-pm` reduce. Single pass. A separate deterministic Workflow driver
  (`code-review-board-wf`) runs the same round off the main loop.
- **instruction-review** (`instruction-review-board`) — the **main thread** runs
  the ownership lint, fans out the participating lenses, verifies, and runs the
  `instruction-editor` reduce. Single pass.

Two costs follow from the divergence:

1. **Model coupling.** Code- and instruction-review do their scoping/selection on
   the **main thread**, so the quality of that step rides on whatever model the
   user happens to have set for the main loop — a silent footgun. Only the reduce
   runs on a chosen model.
2. **No shared contract.** The three flows are independently specified, so a fix
   or improvement to the choreography must be made (and kept consistent) three
   times. There is no single statement of "how a review round runs."

## Goal

One **round** choreography, shared across all three boards, where the
token-heavy reasoning (scope/lens selection AND reduce) runs on a **maintainer**
agent at a chosen model — not on the main thread — and artifacts move as files,
not inline text. The same round is runnable by **two drivers** (main-thread and a
generalized Workflow script) that produce identical per-board output. The
per-board specifics (subject, schema, persistence, outer-loop policy) are
**unchanged**; only the orchestration is unified.

## Conformance

Checked against current present-truth:

- **Reference spec** (`docs/reference-spec/entity-model.md`) — unaffected; no
  entity changes. This work **adds** a new present-truth reference document,
  `docs/reference-spec/review-board-protocol.md` (§H), describing the unified
  round; it contradicts no existing reference content.
- **Design decisions** (`docs/design-decisions/`) — none conflict. The records
  decision is untouched.
- **Instruction rules** — extends `#ai-review-engine` (§H) to state the unified
  round contract; it generalizes, and does not contradict, the existing
  shared-engine rule. The per-application rules (`#ai-spec-review`,
  `#ai-review-board`, `#ai-instruction-review`) are updated to reference the
  shared round rather than restate orchestration.
- **Divergence:** none beyond the present-truth additions named above, which this
  spec itself introduces.

## Design

### A. The round (the unit of unification)

A **round** is a fixed six-step choreography with **no inner loop**:

1. **Kickstart** — the main thread writes a kickstart file: the cheap facts the
   planner needs, computed once so the maintainer never re-derives them (§D).
2. **Plan** — the **maintainer** agent (chosen model) reads the kickstart and
   emits a **routing directive**: which specialist lenses to run, with per-lens
   focus/questions (§D).
3. **Dispatch** — the main thread dispatches the chosen specialists in **parallel**
   (each on its chosen model); each writes its findings to a file and returns
   only a path + count.
4. **Reduce** — the **same maintainer** agent (chosen model) reads the specialist
   findings and emits the consolidated result.
5. **Persist** — board-specific (§C); unchanged from today.
6. **Present** — the main thread surfaces the result.

The maintainer is dispatched **twice** per round (plan, then reduce); it is the
single locus of cross-cutting judgement, kept off the main thread.

### B. Outer loop is board policy, not part of the round

Re-running rounds is the **caller's** decision and lives outside the round
contract:

- **spec-review** — after a round the main thread runs `guard.mjs`; on
  `continue` it revises and runs another round, to convergence / stall / cap
  (`loopPolicy: until-converged`).
- **code-review, instruction-review** — exactly one round (`loopPolicy: once`).

No board has an inner loop inside the round.

### C. Roles — the maintainer plans *and* reduces

The maintainer is the existing reducer **evolved to also plan**. One agent per
board, two dispatches per round:

| Board | Maintainer (plan + reduce) | Specialists | Schema | Persist (unchanged) |
|---|---|---|---|---|
| spec | `spec-specialist` *(already plans + reduces — unchanged)* | `review-<role>` over `spec_review:true` lenses | `Finding` | scratch ledger + `guard.mjs` |
| code | `review-pm` → **`project-manager`** *(gains plan: role/scope selection from `config.yaml`)* | `review-<role>` over config-selected roles | `Issue` | issue store via `persist.mjs` |
| instruction | `instruction-editor` → **`ai-engineer`** *(gains plan: lens participation + opening the ownership-coverage lint as first finding source)* | `review-<role>` over the 9 participating lenses | `InstructionProposal` | triage worksheet |

`review-pm` and `instruction-editor` are **renamed and extended**, not duplicated:
each keeps its reduce duty and gains the plan duty. `spec-specialist` is unchanged
(it already does both). Specialists are unchanged (`review-<role>` personas).

### D. Kickstart and routing contract

Two files per round, shared envelope, per-board payload. Both gitignored scratch.

**Kickstart** (planner input), written by the main thread:
```
{ board: 'spec' | 'code' | 'instruction',
  round: <round-id>,
  subjectRef: <spec path | 'baseline..HEAD' | 'full-audit'>,
  mode: <board-specific>,
  plannerInputs: { ...cheap facts the maintainer would otherwise re-derive } }
```
`plannerInputs` per board:
- **code** — diff stat, changed paths, commit subjects in `baseline..HEAD`, the
  config role table (globs + keywords), `baselineCommit`, `full-sweep` flag.
- **spec** — spec path, the curated `spec_review` lens set, prior ledger/rebuttal
  refs, and per-lens re-consult diffs (re-consults only).
- **instruction** — ownership-coverage-lint output (orphans / double-owned tags),
  the participating role set, the generated-output ref (`node bin/cli.js
  --stdout`), and a parked-worksheet-state summary.

**Routing directive** (planner output), written by the maintainer's plan call —
generalizes spec-review's existing `routing-<n>.json`:
```
{ lenses: [<role>...],
  perLens: { <role>: { focus?: string, questions?: string[] } } }
```

### E. Board descriptor

The shared Workflow driver (§F) and the SKILL prose both parameterize over a
per-board descriptor:
```
{ id: 'spec' | 'code' | 'instruction',
  maintainer: <agent name>,            // spec-specialist | project-manager | ai-engineer
  specialistResolver: (lenses) => [<review-role agent>...],
  schema: 'Finding' | 'Issue' | 'InstructionProposal',
  persist: <persist fn / module ref>,  // board-specific
  loopPolicy: 'once' | 'until-converged',
  scratchDir: (roundId) => <path> }
```
Each board ships one descriptor; nothing else about the driver changes per board.

### F. Two drivers, same choreography, same output

- **Main-thread driver** — the board's `SKILL.md` prose. The main-loop agent
  executes the six steps, dispatching subagents with explicit models. Works on
  any host. The main thread does only cheap dispatch/bookkeeping; all reasoning
  is in the maintainer and specialists.
- **Workflow driver** — a shared `board-round.mjs`, generalized from code's
  current `workflow.mjs`. It reads the descriptor + kickstart and runs the six
  steps deterministically off the main loop via the Workflow tool, applying the
  `loopPolicy`. Today's `code-review-board-wf` becomes the code instantiation of
  this shared driver; spec and instruction gain equivalent `-wf` entry points.

Both drivers write the **same** per-board store/output (the existing
`code-review-board` vs `code-review-board-wf` parity, generalized).

### G. User-facing gates stay on the main thread

The maintainer's plan does **mechanical** scoping only. Interactive decisions
remain on the main thread, around the round, never inside the maintainer:

- **code** — the baseline/confirmation gate (mode, target, `baselineCommit`
  choice).
- **instruction** — the parked-check gate (ignore / consider / stop-and-process).

These run before the round's kickstart is written; their resolved values feed the
kickstart.

### H. Degradation (`#ai-review-engine`, unchanged philosophy)

Stated once for all three boards:

- No Workflow tool → use the main-thread driver.
- No subagents at all → one agent role-plays the maintainer and each lens
  sequentially, emitting the same artifacts with the stance switch explicit.
- No `guard.mjs` (spec) → compute the convergence verdict by hand from the ledger.

### I. Deliverables

1. **Reference spec** `docs/reference-spec/review-board-protocol.md` (present-truth):
   the round, the kickstart/routing contract, the descriptor schema, driver
   parity, and degradation. Linked from the README.
2. **`#ai-review-engine` extended** to state the unified round contract (maintainer
   plan + reduce, the two drivers, the file-handoff discipline). The three
   per-application rules reference it instead of restating orchestration.
3. **Shared `board-round.mjs`** (generalized from `tools/claude/skills/code-review-board/workflow.mjs`)
   plus the three board descriptors.
4. **Three `SKILL.md` files rewritten** to the unified choreography, each pointing
   at a shared maintainer/specialist protocol doc (extend the existing
   `reviewer-common.md`).
5. **Maintainers evolved**: `review-pm` → `project-manager` and
   `instruction-editor` → `ai-engineer` (each gains the plan duty in its persona);
   `spec-specialist` unchanged. Update the agent files, the install set, and every
   reference to the old agent names (mirroring the rename discipline already used
   for the board names).

### J. Sequencing and risk

The shared `board-round.mjs` spanning three schemas, three persist modules, and
two loop policies is the highest-risk piece. The plan **must** build it
incrementally, not all at once:

1. **code first** — it already has a `workflow.mjs` and a parity test; refactor it
   into the descriptor-driven `board-round.mjs` with the code descriptor, proving
   the shape with no behavior change.
2. **spec** — add the `until-converged` loop policy (the outer `guard.mjs` loop)
   and the spec descriptor.
3. **instruction** — add the instruction descriptor; the parked gate stays on the
   main thread (§G), so the driver sees only a resolved kickstart.

The maintainer evolutions (`project-manager`, `ai-engineer`) land alongside their
board's step.

## Non-goals

- **Not** merging the schemas, stores, or per-board outputs — `Finding`, `Issue`,
  and `InstructionProposal`, and their persistence, are unchanged.
- **Not** changing what each board produces or its review semantics — only how a
  round is orchestrated.
- **Not** changing the degradation philosophy — only stating it once.
- The installer stale-file pruning (item 4 audit) is a **separate** spec on this
  branch (`docs/working-specs/2026-06-26-installer-prune/`); it shares no code or
  interface with this work.

## Success criteria

- All three boards run the six-step round; the maintainer performs both plan and
  reduce on a chosen model; the main thread never does the scoping reasoning.
- `board-round.mjs` runs any board from its descriptor; main-thread and Workflow
  drivers produce the same per-board store (parity test per board).
- `docs/reference-spec/review-board-protocol.md` is the single statement of the
  round; `#ai-review-engine` states the contract; the three SKILLs conform.
- Existing per-board tests (persist, guard, schema, lint) still pass; new
  descriptor-driven `board-round.mjs` tests cover the six-step sequence, both
  loop policies, kickstart read, and persist invocation.
