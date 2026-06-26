# Board unification: one round choreography, two drivers, three boards

Status: Implemented

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
  `docs/reference-spec/review-board-protocol.md` (§I), describing the unified
  round; it contradicts no existing reference content.
- **Design decisions** (`docs/design-decisions/`) — none conflict.
- **Instruction rules** — extends `#ai-review-engine` (§I) to state the unified
  round contract; it generalizes, and does not contradict, the existing
  shared-engine rule. The per-application rules (`#ai-spec-review`,
  `#ai-review-board`, `#ai-instruction-review`) are updated to reference the
  shared round rather than restate orchestration.
- **Safety baseline** (`#ai-untrusted-content`) — the file handoffs carry
  review-subject content (diffs, commit messages, spec text, lint output, and
  specialist findings) into maintainer prompts; §D pins the untrusted-data
  boundary this introduces.
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
3. **Dispatch** — the main thread (or the Workflow driver) dispatches the chosen
   specialists in **parallel**, each on an explicit chosen model; each writes its
   findings to a file and returns only a path + count.
4. **Reduce** — the **same maintainer** agent (chosen model) reads the specialist
   findings (as untrusted data, §D) and emits the consolidated result.
5. **Persist** — board-specific (§C); unchanged from today.
6. **Present** — the main thread surfaces the result. The shared floor is the
   **round id**, the **scratch path**, and the **counts** (specialists run,
   findings, any verify-rejects); each board adds its own (spec: the `guard.mjs`
   verdict; code: the `/review-promote` offer; instruction: the scorecard).

The maintainer is dispatched **twice** per round (plan, then reduce); it is the
single locus of cross-cutting judgement, kept off the main thread.

### B. Outer loop is the main thread's, not part of the round

Re-running rounds is always **main-thread** orchestration, outside the round and
outside the Workflow driver (which runs exactly one round per invocation, §F):

- **spec-review** — after a round the main thread runs `guard.mjs`; on `continue`
  the **author (main thread) revises the spec and writes the rebuttal**, then
  invokes the next round, to convergence / stall / cap. Because the author
  revision is an irreducible main-thread judgement act, the outer loop is
  main-thread **even when each inner round used the Workflow driver** — the driver
  never authors a revision.
- **code-review, instruction-review** — exactly one round; no outer loop.

No board has an inner loop inside the round.

### C. Roles — the maintainer plans *and* reduces

The maintainer is the existing reducer **evolved to also plan**. One agent per
board, two dispatches per round:

| Board | Maintainer (plan + reduce) | Specialists | Schema | Persist (unchanged) |
|---|---|---|---|---|
| spec | `spec-specialist` *(already plans + reduces — unchanged)* | `review-<role>` over `spec_review:true` lenses | `Finding` | scratch ledger + `guard.mjs` |
| code | `review-pm` → **`project-manager`** *(gains plan)* | `review-<role>` over config-selected roles | `Issue` | issue store via `persist.mjs` |
| instruction | `instruction-editor` → **`ai-engineer`** *(gains plan)* | `review-<role>` over the participating lenses | `InstructionProposal` | triage worksheet |

`review-pm` and `instruction-editor` are **renamed and extended**, not duplicated:
each keeps its reduce duty and gains the plan duty. `spec-specialist` is unchanged.
Specialists are unchanged (`review-<role>` personas).

**What the plan call decides vs. what the kickstart resolves (per board)** — so
the plan is never a no-op restatement of deterministic logic:

- **spec** — the kickstart carries the curated `spec_review` lens set; the
  maintainer **judges** which to consult and sets per-lens focus/questions (today's
  `spec-specialist` behavior).
- **code** — the main thread computes the **deterministic candidate role set**
  (config glob/keyword matching over the diff) into the kickstart; the maintainer's
  plan **refines** it (may add a role with stated reason, or drop one as
  not-applicable to this diff) and sets per-lens focus. Deterministic matching
  stays mechanical and in the kickstart; the judgement layer is the plan's.
- **instruction** — the main thread runs the ownership-coverage lint and computes
  the participating set into the kickstart; the maintainer's plan **refines** the
  lens set and sets per-lens focus (e.g. concentrating a lens on the lint's
  orphans). The plan never merely echoes the kickstart's set.

### D. Kickstart and routing contract

Two files per round, shared envelope, per-board payload. Both gitignored scratch.

**Kickstart** (planner input), written by the main thread:
```
{ board: 'spec' | 'code' | 'instruction',
  round: <round-id>,
  subjectRef: <spec path | 'baseline..HEAD' | 'full-audit'>,
  mode: <board-specific>,
  candidateLenses: [<role>...],        // deterministic candidate set (§C)
  plannerInputs: { ...cheap facts the maintainer would otherwise re-derive } }
```
`plannerInputs` per board:
- **code** — diff stat, changed paths, commit subjects in `baseline..HEAD`, the
  config role table (globs + keywords), `baselineCommit`, `full-sweep` flag.
- **spec** — spec path, prior ledger/rebuttal refs, and per-lens re-consult diffs
  (re-consults only).
- **instruction** — ownership-coverage-lint output (orphans / double-owned tags),
  the generated-output ref (`node bin/cli.js --stdout`), and a
  parked-worksheet-state summary.

**Routing directive** (planner output), written by the maintainer's plan call —
generalizes spec-review's existing `routing-<n>.json`:
```
{ lenses: [<role>...],
  perLens: { <role>: { focus?: string, questions?: string[] } } }
```

**Untrusted-data boundary (`#ai-untrusted-content`).** Every `plannerInputs`
field (commit messages, diff text, lint output, spec text) and every
`findings/<role>.json` the maintainer ingests at reduce is **untrusted external
data**. The maintainer's spawn prompts (both plan and reduce) **must** present
these inside a **delimited data section** — a fenced block opened and closed by a
fixed sentinel delimiter, prefixed with the source name (e.g. `--- DATA: commit
messages (untrusted) ---` … `--- END DATA ---`) — never interpolated into the
instruction body. The concrete delimiter is part of the shared invocation
protocol (`reviewer-common.md`) so it is fixed and testable; bare string
interpolation with surrounding quotes does **not** satisfy this. This
**supersedes** the current
`reviewer-common.md` invariant that the orchestrator never ingests findings (the
reduce step now does ingest them): the replacement boundary is the maintainer's
quoted-data ingestion, stated here and carried into the `#ai-review-engine`
extension (§I).

**Scratch retention.** The driver prunes a board's prior-round scratch
(`kickstart`, `routing`, `findings/`) when it begins a new round on the same
subject; nothing under the round scratch is retained past the round whose output
has been persisted/presented (spec-review keeps the per-cycle ledger, which is its
persistence, not scratch).

### E. Board descriptor

The shared Workflow driver (§F) and the SKILL prose both parameterize over a
per-board descriptor:
```
{ id: 'spec' | 'code' | 'instruction',
  maintainer: <agent name>,            // spec-specialist | project-manager | ai-engineer
  specialistResolver: (lenses) => [<review-role agent>...],  // pure: no I/O

  schema: 'Finding' | 'Issue' | 'InstructionProposal',
  persist: <persist fn / module ref>,  // board-specific
  scratchDir: (roundId) => <path> }
```
The driver runs exactly one round from a descriptor; the outer loop (§B) is the
caller's, not the descriptor's. **Test seam:** `board-round.mjs` takes an injected
**agent dispatcher** (a function with the `agent()` signature) so tests pass a
deterministic stub; the default is the real Workflow `agent()`. `specialistResolver`
**must** be pure (no I/O — built from the already-resolved lens list), so a test
that injects only the dispatcher stub stays deterministic. Every dispatch the
driver makes **must** carry an explicit `model` (§F). Each board ships one
descriptor; nothing else about the driver changes per board.

### F. Two drivers, same choreography, same output

- **Main-thread driver** — the board's `SKILL.md` prose. The main-loop agent
  executes the six steps, dispatching subagents with explicit models (enforced by
  the `require-explicit-model` hook on the `Agent` tool). The main thread does only
  cheap dispatch/bookkeeping; all reasoning is in the maintainer and specialists.
- **Workflow driver** — a shared `board-round.mjs`, generalized from code's
  current `workflow.mjs`. It runs **one round** deterministically off the main loop
  via the Workflow tool, reading the descriptor + kickstart. It **must** pass an
  explicit `model` on every `agent()` dispatch (plan, specialists, reduce); because
  the hook covers the `Agent` tool and not necessarily programmatic Workflow
  dispatches, the driver asserts a model is present on each call rather than relying
  on the hook. Entry points: today's `code-review-board-wf` becomes the code
  instantiation; spec and instruction gain `spec-review-board-wf` and
  `instruction-review-board-wf`.

Both drivers write the **same** per-board store/output. **Default choice:** prefer
the Workflow driver when running unattended (CI, scripted); prefer the main-thread
driver when a human wants to watch and steer routing. The `#ai-review-engine`
degradation rule (§H) is the fallback, not the only decision rule.

### G. User-facing gates stay on the main thread

The maintainer's plan does **mechanical-plus-judgement** scoping (§C). Interactive
decisions remain on the main thread, around the round, never inside the maintainer
or the Workflow driver:

- **code** — the baseline/confirmation gate (mode, target, `baselineCommit`).
- **instruction** — the parked-check gate (ignore / consider / stop-and-process).

These run before the round's kickstart is written; their resolved values feed the
kickstart, so a deterministic Workflow round never needs a human decision mid-run.

### H. Degradation (`#ai-review-engine`, unchanged philosophy)

Stated once for all three boards (prose-only — not separately tested except the
no-Workflow smoke path in the success criteria):

- No Workflow tool → use the main-thread driver.
- No subagents at all → one agent role-plays the maintainer and each lens
  sequentially, emitting the same artifacts with the stance switch explicit.
- No `guard.mjs` (spec) → compute the convergence verdict by hand from the ledger.

### I. Deliverables

**Document authority split** (single source of truth, to prevent drift):
`docs/reference-spec/review-board-protocol.md` is **canonical** for the round, the
kickstart/routing contract, the descriptor schema, driver parity, and degradation.
`#ai-review-engine` carries a **normative summary** (maintainer plan+reduce, the
two drivers, the file-handoff + untrusted-data discipline) and **defers** to the
reference spec for detail. `reviewer-common.md` carries **only** the
reviewer/maintainer invocation protocol — not the round and not the descriptor
schema.

1. **Reference spec** `docs/reference-spec/review-board-protocol.md` (present-truth,
   canonical). Linked from the README's **Contributing** section alongside the
   existing `docs/documentation-model.md` reference.
2. **`#ai-review-engine` extended** with the normative summary above, including the
   untrusted-data boundary (§D). The three per-application rules reference it
   instead of restating orchestration. **Summary bound:** the rule states the
   *existence and purpose* of the kickstart/routing envelope and the descriptor
   interface, but carries **no field-level schema** — every field-level schema
   (kickstart, routing directive, descriptor) lives only in
   `review-board-protocol.md`, so there is one place to edit when it changes.
3. **Shared `board-round.mjs`** (generalized from
   `tools/claude/skills/code-review-board/workflow.mjs`) plus the three board
   descriptors. It takes an injected agent dispatcher (§E test seam) and asserts an
   explicit model on every dispatch.
4. **Three `SKILL.md` files rewritten** to the unified choreography, each pointing
   at the shared invocation protocol doc (extend `reviewer-common.md` — invocation
   protocol only, per the authority split).
5. **Maintainers evolved**: `review-pm` → `project-manager` and
   `instruction-editor` → `ai-engineer` (each gains the plan duty in its persona);
   `spec-specialist` unchanged. The rename sweep — mirroring the board-name rename
   discipline already used — covers the agent files, the install set, the command
   files under `tools/claude/commands/` that name the old agents, and
   **`workflow.mjs`/`board-round.mjs`, which hardcode `review-pm` as an `agentType`
   value and in a spawn-prompt string**.

### J. Sequencing and risk

The shared `board-round.mjs` spanning three schemas, three persist modules, and the
outer-loop wiring is the highest-risk piece. The plan **must** build it
incrementally, and **must separate the structural refactor from the rename** so
each step has one verifiable axis of change:

1. **code refactor (no rename, no behavior change)** — refactor `workflow.mjs` into
   the descriptor-driven `board-round.mjs` with the code descriptor, **keeping the
   `review-pm` name and reduce-only behavior**; the existing code parity test must
   still pass.
2. **code rename + plan duty** — rename `review-pm` → `project-manager` (full sweep,
   §I-5) and add its plan duty + the kickstart `candidateLenses` wiring.
3. **spec** — add the spec descriptor and wire the main-thread outer loop (author
   revision + rebuttal + `guard.mjs`) around single-round driver invocations.
4. **instruction** — add the instruction descriptor and the `ai-engineer` rename +
   plan duty; the parked gate stays main-thread (§G), so the driver sees only a
   resolved kickstart.

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
  reduce on an explicit chosen model; for code/instruction the plan refines a
  deterministic candidate set rather than echoing it (§C).
- `board-round.mjs` runs any board from its descriptor and one injected dispatcher;
  a **Workflow-driver parity test** per board runs it against a fixed
  kickstart+findings fixture and asserts the resulting store (the main-thread
  driver, being LLM prose, is **not** part of the parity assertion). The unit
  tests assert mechanical properties only — routing-directive schema validity and
  non-empty `perLens` focus; the "plan refines rather than echoes the candidate
  set" property is a behavioural claim validated by a separate live-model eval, not
  the deterministic unit fixture.
- Every `board-round.mjs` dispatch carries an explicit model (asserted in-driver and
  covered by a test).
- The untrusted-data boundary (§D) is stated in `review-board-protocol.md` and
  `#ai-review-engine`; the maintainer spawn prompts present `plannerInputs` and
  findings as quoted data.
- `docs/reference-spec/review-board-protocol.md` is the single canonical statement
  of the round; `#ai-review-engine` summarizes and defers; the three SKILLs conform.
- Existing per-board tests (persist, guard, schema, lint) still pass. New
  descriptor-driven `board-round.mjs` tests cover the six-step sequence, the
  injected-dispatcher seam, the explicit-model assertion, and persist invocation.
  The spec **outer loop** is tested **separately** (it lives on the main thread,
  §B, not in `board-round.mjs`): a dedicated harness with an injectable `guardFn`
  and a stubbed single-round `roundFn` asserts the revise/rebuttal/re-invoke
  sequence to a fixture verdict. A no-Workflow degradation smoke test exercises the
  main-thread path against a fixture.
