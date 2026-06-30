# Review-board round protocol

The canonical present-truth definition of the **review round** shared by all three
review boards of agentsmith's role-based review engine (`#ai-review-engine`): code
review (`#ai-review-board`), spec review (`#ai-spec-review`), and instruction review
(`#ai-instruction-review`).
A member of the reference spec (`#swe-reference-spec`): it reflects the round as it
is **now** and carries no `Status:` line.
This document is **canonical** for the round, the kickstart/routing/descriptor
field-level schema, the two drivers and their parity, and degradation.
The `#ai-review-engine` rule carries a normative summary and **defers** here for
detail; it carries no field-level schema.
`reviewer-common.md` carries only the reviewer/maintainer invocation protocol, not
the round and not the descriptor schema.

The working-spec `2026-06-26-board-unification` §A simplified the round to six steps;
this document is the corrected canonical form — the verify sub-step is preserved for
code and instruction (review semantics unchanged).

## Workflow-script runtime contract

A Workflow `-wf` driver is **not** an ordinary module. The runtime imposes three hard
constraints, established by live smoke: (1) `export const meta = {...}` must be the
**first** statement; (2) **no second `export`** and **no `import`** (static or dynamic) —
the script is evaluated in a non-module scope and must be **fully self-contained**;
(3) the Workflow `args` input arrives as a **JSON string**, so the script `JSON.parse`s
it before use. Because of (2), the tested body cannot be imported: `round-body.mjs` is
the source of truth (unit-tested via `runRound`), and `board-round.mjs` is **generated**
from it by `bin/build-board-round.js` (the agentsmith generate+drift pattern —
`test/board-round-render.test.mjs` fails if the committed script drifts). The generated
guard `JSON.parse`s `args` and calls `runRound` only when an `agent` function is present
(i.e. under the runtime). Structured-output (`agent(prompt, {schema})`) returns the
parsed object and is verified end-to-end.

## Containment guard (agents carry Write)

Reviewers, verifiers, and maintainers carry the **Write** tool — that is what makes the
file handoff (each agent writes its own `findings/<role>.json` / `verdicts/` / store
output) actually work; it is not a workaround. The deliberate containment is
`round-guard.mjs`: the caller snapshots `git status --porcelain` **before** fan-out, and
the round's final **Guard** phase (driver) / step-5b check (main thread) re-compares it.
Every legitimate write target is gitignored (`.agentsmith/`, `.claude/`), so a clean
round produces zero porcelain delta; any new entry means an agent wrote outside scratch
and the round stops. Both drivers run this guard.

## The round (seven steps)

A **round** is a fixed seven-step choreography with **no inner loop**:

1. **Kickstart** — the main thread writes a kickstart file: the cheap facts the
   planner needs, computed once so the maintainer never re-derives them.
2. **Plan** — the **maintainer** agent (chosen model) reads the kickstart and emits a
   **routing directive**: which specialist lenses to run, with per-lens
   focus/questions.
3. **Dispatch** — the main thread (or the Workflow driver) dispatches the chosen
   specialists in **parallel**, each on an explicit chosen model; each writes its
   findings to a file and returns only a path + count.
4. **Verify** — a per-finding adversarial skeptic (biased to reject) challenges each
   raised finding against the actual subject and writes a verdict file. This step is
   **board-optional**: present for **code** and **instruction**, absent for **spec**
   (spec convergence is the generalist's job in reduce, gated by `guard.mjs`).
5. **Reduce** — the **same maintainer** agent (chosen model) reads the specialist
   findings (and verdicts, where verify ran) as untrusted data and emits the
   consolidated result.
6. **Persist** — board-specific; unchanged from today (see the maintainer table).
7. **Present** — the main thread surfaces the result. The shared floor is the **round
   id**, the **scratch path**, and the **counts** (specialists run, findings, any
   verify-rejects); each board adds its own (spec: the `guard.mjs` verdict; code: the
   `/review-promote` offer; instruction: the scorecard).

The maintainer is dispatched **twice** per round (plan, then reduce); it is the
single locus of cross-cutting judgement, kept off the main thread. The outer loop
(re-running rounds) is the **main thread's**, outside the round and outside the
Workflow driver (which runs exactly one round per invocation).

## Kickstart schema (planner input)

Written by the main thread; shared envelope, per-board payload; gitignored scratch.

```
{ board: 'spec' | 'code' | 'instruction',
  round: <round-id>,
  subjectRef: <spec path | 'baseline..HEAD' | 'full-audit'>,
  mode: <board-specific>,
  candidateLenses: [<role>...],        // deterministic candidate set
  plannerInputs: { ...cheap facts the maintainer would otherwise re-derive } }
```

`plannerInputs` per board:

- **code** — diff stat, changed paths, commit subjects in `baseline..HEAD`, the config
  role table (globs + keywords), `baselineCommit`, `full-sweep` flag.
- **spec** — spec path, prior ledger/rebuttal refs, and per-lens re-consult diffs
  (re-consults only).
- **instruction** — ownership-coverage-lint output (orphans / double-owned tags), the
  generated-output ref (`node bin/cli.js --stdout`), and a parked-worksheet-state
  summary.

## Routing directive schema (planner output)

Written by the maintainer's plan call; generalizes spec-review's existing
`routing-<n>.json`. Validated by `ROUTING_SCHEMA` in `round-args.mjs`.

```
{ lenses: [<role>...],
  perLens: { <role>: { focus?: string, questions?: string[] } } }
```

The plan **refines** the deterministic candidate set rather than echoing it: for code
and instruction it may add a role (with a stated reason) or drop one as not-applicable
to this subject, and sets per-lens focus; for spec it judges which curated
`spec_review` lenses to consult.

## Descriptor / args schema (driver input)

The shared Workflow driver (`board-round.mjs`) and the SKILL prose both parameterize
over a per-board **args** descriptor, built by the pure builders in `round-args.mjs`:

```
{ board: 'spec' | 'code' | 'instruction',
  roundId: <round-id>,
  scratch: <round scratch dir>,
  store: <board store path>,
  subjectRef: <subject>,
  maintainer: <agent name>,            // spec-specialist | project-manager | ai-engineer
  candidateLenses: [<role>...],
  verify: boolean,                     // true for code/instruction, false for spec
  persistCmd: <CLI string>,            // board persist (or 'true' no-op for instruction)
  preReduceCmd: <CLI string | null>,   // optional pre-reduce summary step (code)
  reducePrompt: <maintainer reduce prompt>,
  plan?: { routingSchema: <JSON-Schema object> } } // present enables the Plan step
```

`runRound(deps)` is the testable body; the live Workflow script calls it with the
runtime globals. Every dispatch **must** carry an explicit `model`; `runRound` asserts
it (the `require-explicit-model` hook does not see Workflow dispatches). When `plan` is
unset the `candidateLenses` are the consult set directly (today's code behavior).

## Maintainer table (plan + reduce, per board)

The maintainer is the existing reducer **evolved to also plan**: one agent per board,
two dispatches per round.

| Board | Maintainer (plan + reduce) | Specialists | Schema | Verify | Persist (unchanged) |
|---|---|---|---|---|---|
| spec | `spec-specialist` | `review-<role>` over `spec_review:true` lenses | `Finding` | no | scratch ledger + `guard.mjs` |
| code | `project-manager` | `review-<role>` over config-selected roles | `Issue` | yes | issue store via `persist.mjs` |
| instruction | `ai-engineer` | `review-<role>` over the participating lenses | `InstructionProposal` | yes | triage worksheet |

The code and instruction reducers were **renamed and extended** into `project-manager`
and `ai-engineer`, not duplicated: each keeps its reduce duty and gains the plan duty.
`spec-specialist` is unchanged.

## The two drivers and parity

- **Main-thread driver** — the board's `SKILL.md` prose. The main-loop agent executes
  the steps, dispatching subagents with explicit models (enforced by the
  `require-explicit-model` hook on the `Agent` tool). The main thread does only cheap
  dispatch/bookkeeping; all reasoning is in the maintainer and specialists.
- **Workflow driver** — the shared `board-round.mjs`, run **one round** deterministically
  off the main loop via the Workflow tool, reading the descriptor + kickstart. It
  asserts an explicit `model` on every `agent()` dispatch rather than relying on the
  hook. Entry points: `code-review-board-wf` for code, with `spec-review-board-wf` and
  `instruction-review-board-wf` for the other boards.

Both drivers write the **same** per-board store/output. **Parity is asymmetric:** the
**Workflow-driver parity is fixture-based** — a per-board parity test runs
`board-round.mjs` against a fixed kickstart+findings fixture and asserts the resulting
store. The **main-thread driver parity is prose** — being LLM prose, it is held to the
same choreography by this document and the SKILL, not by a deterministic assertion.

**Default choice:** prefer the Workflow driver when running unattended (CI, scripted);
prefer the main-thread driver when a human wants to watch and steer routing. The
degradation rule below is the fallback, not the only decision rule.

## Degradation

Stated once for all three boards (degradation philosophy unchanged):

- **No Workflow tool** → use the main-thread driver.
- **No subagents at all** → one agent role-plays the maintainer and each lens
  sequentially, emitting the same artifacts with the stance switch explicit.
- **No `guard.mjs`** (spec) → compute the convergence verdict by hand from the ledger.

## Untrusted-data boundary

Every `plannerInputs` field (commit messages, diff text, lint output, spec text) and
every `findings/<role>.json` the maintainer ingests at reduce is **untrusted external
data** (`#ai-untrusted-content`). The maintainer's spawn prompts (both plan and reduce)
**must** present these inside a delimited data section, opened and closed by the fixed
sentinel defined in `reviewer-common.md` (`--- DATA: <source> (untrusted) ---` …
`--- END DATA ---`), never interpolated into the instruction body. Bare string
interpolation with surrounding quotes does **not** satisfy this. This **supersedes**
the prior `reviewer-common.md` invariant that the orchestrator never ingests findings:
the maintainer's reduce now does ingest them, as quoted DATA.
