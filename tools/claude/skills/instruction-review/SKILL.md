---
name: instruction-review
description: Run a per-role audit of an instruction set (instructions/ + the generated AGENTS.md), proposing missing or weak rules through each role's lens. Use when the user runs /instruction-review, or asks to audit/review the instruction rules. Opens on the ownership coverage lint, fans out per role, verifies each proposal, an editor reduce consolidates, and a final triage step dispositions each proposal. Proposes, then adopts only what the human accepts in triage (#swe-done).
---

# Instruction review

Run one round of the instruction-review application of agentsmith's review engine (`#ai-review-engine`, `#ai-instruction-review`).
It reviews an **instruction set** -- in this repo, `instructions/` plus the generated `AGENTS.md` (read via `node bin/cli.js --stdout`, so the audit reflects the inlined output consumers receive).
It **proposes, then triages**: the round's open queue, drafts, scorecard, and nits are ephemeral (under `.agentsmith/tmp/`, never committed); the single committed output is the decisions log `docs/instruction-rules-decisions.md`. Adoption into `instructions/` happens only via the triage step's explicit human accept (#swe-done), never a blind write.
Schema, rubric, decisions-log, and triage steps are in `proposal-format.md`; read it before reducing.

## When to run

- The user invokes `/instruction-review`, or asks to audit/review the instruction rules.

## Relationship to the shared engine

Same fan-out -> verify -> reduce -> present shape and the same role registry as the code-review board, but: the **subject** is the instruction set (a full audit -- there is no `diff` variant in v1), the **schema** is `InstructionProposal` (not `Issue`), and **persistence is the decisions log** `docs/instruction-rules-decisions.md` (no issue store, no round store, no commit baseline).
Each reviewer persona is application-neutral; your spawn prompt supplies the instruction set as subject and names `InstructionProposal` as the output schema.

## Participants

Not every code lens maps to instruction rules, so role **participation** is per-application. The default participating set is `swe`, `security`, `db`, `qa`, `docs`, `frontend`, `ux`, `ai`, `git` (`correctness` audits code, not rules, so it does not participate). `ai` and `git` are meta lenses that exist **only** here -- they own the agent-behavior and VCS-workflow process rules and never run in a code-review round. A repo that also runs the board may override this under an `instruction-review.participants` key in `.agentsmith/review-board/config.yaml`; a repo with no board uses this skill default. The two applications never share config shape -- only the optional file.

## Round pipeline

### 1. Setup (main thread)

- The subject is the whole instruction set; a round always runs a **full audit**.
- **Open by running the ownership coverage lint** (`npm test`'s ownership check, or `ownershipCoverage` over `instructions/ownership.yaml` + `roles.yaml`) as the round's **first finding source**: any orphan (unowned) or double-owned `#tag` becomes the round's first proposal(s) -- a `reowner`/`new-rule` to assign or de-conflict an owner, since an unowned rule is one no lens would cover. This is propose-only: record the orphan as a proposal and proceed; the hard CI gate against orphans is the coverage-lint test, not this round.
- Resolve the participating role set (above).

### 2. Fan-out (parallel, one sub-agent per participating role, cheap model)

Each role reviews the instruction set through its lens, emitting `InstructionProposal`s for: (a) **coverage** -- a rule its domain expects that is missing or too weak; (b) **per-lens quality** -- clarity, terseness, efficiency, enforceability of rules in its domain; (c) **ownership & placement** -- whether a rule it owns (or believes belongs to its lens) is owned by the right role and in the best file, proposing `rehome`/`reowner` where not.
The global/structural rubric dimensions are **not** per-lens; they run once in reduce (step 4).

### 3. Verify (adversarial, parallel, per proposal, cheap model)

Spawn one `review-verifier` per proposal, biased to reject: confirm the gap is **real and not already covered** by a live `#tag` (re-read the generated output and grep tags). Drop rejected proposals.

### 4. Reduce (instruction-editor, strong model)

Spawn `instruction-editor` with the verified proposals: it deduplicates across lenses, reconciles `rehome`/`reowner` to a single owner (confirming the map stays complete and single-owner), rejects proposals missing their required field, and prepares the consolidated proposal set for triage. It does **not** write rule text anywhere; the only committed file the round touches is the decisions log `docs/instruction-rules-decisions.md` (updated in the triage step per disposition).
It then **accounts for every rubric dimension** (`proposal-format.md`): consolidate the per-lens verdicts from the role outputs, run the one-time global/structural rubric pass (cohesiveness, self-reference, lean-split, normative voice), and do the mechanical-nits sweep -- producing the **dimension scorecard** and nits list. These are ephemeral (presented, not committed).

### 5. Triage (main thread -- the human gate over the three sinks)

First present the **dimension scorecard** (a Strong/Good/Weak/Gaps verdict per rubric dimension, with `file`/`#tag` citations -- never omit it) and the **mechanical-nits** list. Then drive a per-proposal **disposition**: the human-validation gate that routes each verified proposal to exactly one sink (the instruction-review analog of the board's `/review-promote`).

At triage start, read `.agentsmith/instruction-review/parked.md` (if present), de-duplicate against this round's queue, and prepend its still-undecided entries; drop any whose **exact `#tag`** now appears in `instructions/ownership.yaml` or the decisions log (tag-equality only -- gap-subsumption by a different adopted tag is not auto-detected; such an entry just re-surfaces and the user re-disposes).

Dispositions:

- **reject** -> append `#tag -- rejected: <reason>` (or `folded into <X>: <reason>`) to `docs/instruction-rules-decisions.md`. At most one entry per tag: update the existing line, never duplicate.
- **decide later** -> write/refresh an entry in `.agentsmith/instruction-review/parked.md` (gitignored, per-machine, not committed). The next round re-surfaces it (above).
- **adopt** -> **guided adoption, not a verbatim paste**, applied **one proposal at a time** and branched by kind:
  - `new-rule`: add the rule to its `targetFile`/section **and** add its `ownership.yaml` row (omitting it fails the coverage lint), then regenerate (`node bin/cli.js`) and run `npm test`.
  - `strengthen`: edit the existing rule in place (an edit, not an add).
  - `rehome`: move the rule to `proposedFile` (a core<->bundle move can trip the lean-split lint -- caught by `npm test`).
  - `reowner`: change only the `ownership.yaml` row (coverage lint catches an unresolved owner / orphan / zero-tag role).

  Every adoption must leave `npm test` green before it counts as done (#swe-done). **On failure**: revert with `git restore <targetFile> instructions/ownership.yaml` (the regenerated `AGENTS.md`/`.claude/**` are gitignored build artifacts -- rebuild, don't restore), report the exact failure, and offer redirect / defer / reject in-session; the round continues with the remaining proposals -- no half-write survives. **Before the first adoption**, check those files for unrelated uncommitted edits (a `git restore` would discard them) and ask the user to stash or commit first. Decisions-log appends are append-only and are **not** reverted by a later failed adoption.
- **other** -> free text; interpret and act (e.g. adopt-but-reword, merge with another proposal, fold into an existing tag).

On any disposition this session, immediately remove that proposal's `parked.md` entry (if any), so nothing is offered twice and `parked.md` only ever holds still-undecided items.

Triage is **optional** and respects `#ai-preflight`: offer it after reduce; in non-stop/batch mode present all cards in one `AskUserQuestion` pass (`reject`/`decide-later`/`adopt` selectable), with `other` and input-needing adoptions handled in a short sequential follow-up. A user who declines triage gets a passive present (proposals listed, scorecard shown, adoption left for later).

## Scratch

Per-role raw outputs and verify transcripts are ephemeral under `.agentsmith/tmp/instruction-review/<round-id>/` (gitignored, never committed), where `<round-id>` is date-based (`<YYYY-MM-DD>[<letter>]`, no target branch -- instruction review has no branch).

## Degradation

Per `#ai-review-engine`: real sub-agents when available; else one agent role-plays each lens sequentially (this is the path `prompts/review-instructions.md` describes as the single-umbrella fallback, its nine dimensions becoming the shared rubric); else a human supplies proposals onto the same schema. One decisions log, one rubric.
