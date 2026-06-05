# Spec: Spec auto-review

Date: 2026-05-30
Status: Implemented

## Motivation

A proposed spec is the cheapest place to catch a design flaw, yet specs usually get one casual read before work starts.
We want an opt-in adversarial review loop that hardens a spec before it becomes a plan, run by an agent acting as a dedicated reviewer.
This is the first feature exercising agentsmith's broadened scope: shipping the tools for best software-engineering practice with AI agents, not just a portable `AGENTS.md`.

## Goals

- After an agent proposes a spec, it offers a spec auto-review; the user opts in or declines.
- When accepted, an adversarial **spec-specialist reviewer** and the **author** alternate in review rounds until the spec converges or the loop escalates.
- The protocol is portable: it is described tool-agnostically so it works (or degrades) in any assistant that consumes the generated `AGENTS.md`.
- Claude Code additionally gets a concrete implementation (subagent + skill + command) that realizes the protocol with real sub-agent delegation.

## Non-goals

- Auto-reviewing plans, code, or PRs; this covers specs only (other artifacts may reuse the pattern later).
- Committing any intermediate review artifact; only the final spec is persisted (see Artifacts).
- A hook-enforced trigger; the offer is a soft instruction the agent makes, with an observable contract (see Trigger) but no runtime enforcement (revisit only if agents skip it in practice).

## The protocol (portable)

This is the source of truth, expressed tool-agnostically and emitted via `AGENTS.md`.

### Definitions

- **Round** -- one reviewer review followed by one author revision-and-rebuttal.
  The round cap counts these units.
- **Finding** -- a single issue the reviewer raises, tagged **blocking** (the spec cannot proceed to a plan) or **nit** (minor, optional).
  Each finding carries a **stable id** the reviewer assigns from the issue's substance (e.g. `converge-baseline`), reused verbatim when the same issue recurs so it can be tracked across rounds.
- **Finding ledger** -- the running list of findings across all rounds, each with a status: `open`, `resolved` (author fixed it and the reviewer no longer raises it), or `wontfix` (author declined with rationale).
  The ledger, not a raw per-round count, is what the convergence guard reads.

### Trigger

The offer is soft (no hook) but has an observable contract: **the turn that writes or substantially revises a file under `docs/specs/` ends by offering the spec auto-review and waiting for the user's choice.**
The agent does not start a review unprompted.
A turn that writes a spec file and does not end with the offer is a detectable miss.

### Roles

- **Author** -- the agent that wrote the spec; revises it and answers the review.
- **Spec-specialist reviewer** -- an adversarial reviewer whose sole job is to find what is wrong, missing, ambiguous, or untestable in the spec.
  Where the tool supports sub-agents, the author delegates this role to a separate agent so the critique is independent.

### Round loop

1. The reviewer reads the current spec and the finding ledger, then writes a review: for each issue, a finding with its stable id, tag, problem, and suggested fix.
   The reviewer reuses an existing id when re-raising an open issue and **must not re-litigate a `wontfix` finding unless it presents new information**.
2. The author reads the current review, the current spec, and the ledger (the same latest-only bound the reviewer has), revises the spec to address the findings, then writes a **rebuttal**: per finding id, marks it `resolved` (what changed) or `wontfix` (why not), and updates the ledger.
3. The next round's reviewer reads the current spec, the latest rebuttal, and the finding ledger -- not the full history of prior reviews (Open question 3, decided: latest spec + latest rebuttal + ledger, to bound context).

### Convergence guard

The guard is evaluated **after each review** (before that round's rebuttal), reading the ledger.
A finding "counts as open" only if its status is `open` (not `resolved`, not `wontfix`).
Let `b(i)` be the open-blocking count after review `i` (indexed by review, so review `i` is the review half of round `i`).
Let `best` be the lowest `b` seen across all **prior** reviews (undefined before review 1).
The three conditions are checked **in this order**; the first that holds wins and stops the loop.
Only **after** the checks is `best` updated: `best := min(best, b(i))`.
So the stall test reads the pre-update `best`, never a value already lowered by the current review.

1. **Converged** -- review `i` raises no open blocking findings (`b(i) = 0`).
   Stop and present the final spec; open nits may remain in the ledger (they are optional by definition and need not be dispositioned).
2. **Stalled** -- a review **makes progress** when its `b(i)` is strictly below `best` (review 1 always counts as progress, having no prior `best`).
   Stall fires when two consecutive reviews both fail to make progress, so the earliest it can fire is review 3; a progress review resets the consecutive-non-progress tally to zero.
   Because Converged is checked first, a converged review never counts toward the stall tally; only non-converged, non-progress reviews accumulate.
   This catches both flatlining (`3 -> 3 -> 3`) and thrashing (`3 -> 5 -> 4`: neither beats `best = 3`).
   Stop and ask the user how to proceed.
3. **Round cap** -- at most 5 rounds; the cap is reached when review 5 is evaluated without convergence.
   It is a rarely-hit backstop -- the stall rule normally fires first -- so reaching it means `b` never reached 0 yet never stalled (no two consecutive non-progress reviews); stop and ask the user how to proceed.

When the loop stops for stall or cap, the agent summarizes the open blocking findings and the disagreement (including any `wontfix` the reviewer contests) so the user can decide.

### Reconciliation with interaction rules

The user's opt-in to the auto-review **is** the interaction-shape decision (`#ai-preflight`, `#ai-memory`): once accepted, the loop runs batched and non-stop until a convergence guard fires, then pauses for the user.
No guard-free silent mode exists -- the loop always halts at converged, stalled, or the 5-round cap.
Auto-review is a review activity, not plan execution, so `#ai-preflight`'s plan-execution preflight does not gate it; the opt-in covers the equivalent consent.

### Artifacts

- Only the **final spec** is persisted and committed, at its normal path (`docs/specs/<YYYY-MM-DD>-<slug>.md`).
- Each round's review and rebuttal, and the ledger, are **ephemeral scratch**: written to a gitignored location so they can be inspected during and after the run, never committed.
  They are written under `.agentsmith/tmp/spec-review/<slug>/round-<n>.{review,rebuttal}.md` plus `ledger.md` -- `.agentsmith/` is already gitignored and marks the data as agentsmith-generated.
  The scratch schema is identical across degradation modes; in single-agent mode the agent still emits both files per round with the stance switch made explicit in each.
- The PR body (`#git-pr-body`) notes whether the review converged, stalled, or hit the cap; the scratch trail is ephemeral and is not part of `#swe-done`.

### Graceful degradation

The convergence guard, round cap, ledger, and rebuttal-passing apply in every mode; only the reviewer's independence varies (and is absent in single-agent mode).

1. **Delegated reviewer** -- independent sub-agent per round, where the tool supports sub-agents.
2. **Single-agent role-play** -- the author switches to the reviewer stance each round, emitting both artifacts with the stance switch explicit.
3. **Manual** -- a human performs the reviewer role; the agent maps the human's findings onto stable ids, maintains the ledger and guard, and enforces the `wontfix` and no-re-litigation rules on the human's behalf.

## Claude Code implementation

The Claude Code artifacts (skills, subagent definitions, slash commands) are Claude-specific formats, not portable; ChatGPT and Gemini do not read them.
So they are **tool adapters**: thin realizations of the one portable protocol (which lives in `instructions/` and reaches every tool via `AGENTS.md`) in Claude Code's native format.
Other tools that gain an adapter live under their own `tools/<ai>/`; until then they fall back to the degradation modes above.
"Keeping adapters in sync" means each stays faithful to the single protocol, not that the folders are kept identical.

The committed source lives under `tools/claude/` and is installed into `.claude/` (gitignored) by a generator copy run by `npx agentsmith`, the same build that emits `AGENTS.md`.
A copy, not a symlink -- symlinks need admin/dev-mode on Windows and are fragile.

```
tools/claude/
  agents/spec-specialist.md        subagent: adversarial spec-reviewer persona + finding/id schema
  skills/spec-review/
    SKILL.md                       orchestrator: round loop, ledger, rebuttal passing, convergence guard
    finding-format.md              reference: finding id, blocking/nit, resolved/wontfix, rebuttal schema
  commands/spec-review.md          /spec-review <spec-path>: manual entry point
```

Responsibilities:

- **Subagent** (`spec-specialist`) -- holds the reviewer persona and the finding/id schema; invoked fresh each round with the current spec, latest rebuttal, and ledger.
- **Skill** (`spec-review`) -- owns the loop: spawn reviewer, collect findings, prompt the author to revise and rebut, maintain the ledger, evaluate the convergence guard, write scratch, escalate to the user.
- **Command** (`/spec-review`) -- manual entry to run the loop on an existing spec, independent of the soft trigger.
- **Plugin packaging** -- deferred; bundle subagent + skill + command into a versioned plugin only when distribution outside this repo is needed (YAGNI per `#swe-agile`).

The exact generator wiring (a new `npx agentsmith` step, or a dedicated subcommand) is an implementation detail for the plan.

## agentsmith scope and naming

README is updated to state the broadened objective. Target wording (exact phrasing finalized in the plan):

> agentsmith forges the tooling for best software-engineering practice with AI agents -- portable instructions, and, where a tool supports them, skills, commands, and plugins. The inlined `AGENTS.md` is its default output, not its only one; portability is the default and tool-specific artifacts are additive.

The portable instruction layer (`instructions/`) remains the core; tool-specific artifacts (e.g. `claude/`) sit beside it as additional, hand-maintained outputs until a generator earns its place.

## Instruction rule

Add `#ai-spec-review` to `instructions/core/ai.md`, adjacent to `#ai-plan`, derived verbatim from the now-settled protocol above: the observable trigger, the round/finding/ledger definitions, the round loop, the convergence guard (zero open-blocking = converged; two consecutive reviews that fail to beat the best open-blocking count seen so far = stalled, earliest review 3; 5-round cap = ask the user), the rebuttal and `wontfix` mechanics, the artifact policy (final spec committed, rounds ephemeral and uncommitted), and the three degradation modes.

## Resolved decisions

1. Committed source directory: **`tools/claude/`** -- the artifacts are Claude-specific tool adapters, not generic; other tools get `tools/<ai>/` when they gain an adapter.
2. Source reaches `.claude/` by a **generator copy** run as part of `npx agentsmith` (not a symlink -- Windows-hostile); the ephemeral review scratch lives in **`.agentsmith/tmp/spec-review/<slug>/`** (already gitignored, marks the data as agentsmith-generated).

## Verification

- Dogfood: run the auto-review protocol against this very spec before implementing it.
  The dogfood uses **real sub-agent delegation** (the reviewer is a separate agent via the host's sub-agent tool) but **manual orchestration** by the main agent -- the skill and command do not exist yet, so the loop is driven by hand.
  This is not circular: independent reviewer delegation already exists (the dogfood uses the delegated mode); only the orchestration automation is unbuilt.
  **Outcome (2026-05-30):** the protocol was run by hand against this spec over 5 rounds; open-blocking count fell `9 -> 3 -> 2 -> 1 -> 0` and the loop **converged** at round 5 (no stall, cap not hit). The run exercised the round loop, the finding ledger, rebuttals, and the convergence guard, and surfaced three real defects in the guard's own math that the loop then fixed.
- Once implemented, the first real spec authored in the repo exercises the soft trigger and the full loop end to end.
