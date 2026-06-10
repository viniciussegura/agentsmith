---
name: instruction-review
description: Run a per-role audit of an instruction set (instructions/ + the generated AGENTS.md), proposing missing or weak rules through each role's lens. Use when the user runs /instruction-review, or asks to audit/review the instruction rules, or to roll the proposed-instruction-rules backlog. Opens on the ownership coverage lint, fans out per role, verifies each proposal, and an editor reduce rolls the backlog. Proposes only -- never edits instruction sources.
---

# Instruction review

Run one round of the instruction-review application of agentsmith's review engine (`#ai-review-engine`, `#ai-instruction-review`).
It reviews an **instruction set** -- in this repo, `instructions/` plus the generated `AGENTS.md` (read via `node bin/cli.js --stdout`, so the audit reflects the inlined output consumers receive).
It **proposes only**: the single file it writes is the rolling backlog `docs/future-work/proposed-instruction-rules.md`.
Schema, rubric, and backlog steps are in `proposal-format.md`; read it before reducing.

## When to run

- The user invokes `/instruction-review`, or asks to audit/review the instruction rules, or to roll the proposal backlog.

## Relationship to the shared engine

Same fan-out -> verify -> reduce -> present shape and the same role registry as the code-review board, but: the **subject** is the instruction set (a full audit -- there is no `diff` variant in v1), the **schema** is `InstructionProposal` (not `Issue`), and **persistence is the backlog roll** (no issue store, no round store, no commit baseline).
Each reviewer persona is application-neutral; your spawn prompt supplies the instruction set as subject and names `InstructionProposal` as the output schema.

## Participants

Not every code lens maps to instruction rules, so role **participation** is per-application. The default participating set is `swe`, `security`, `db`, `qa`, `docs`, `frontend`, `ux` (`correctness` audits code, not rules, so it does not participate). A repo that also runs the board may override this under an `instruction-review.participants` key in `reviews/config.yaml`; a repo with no board uses this skill default. The two applications never share config shape -- only the optional file.

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

Spawn `instruction-editor` with the verified proposals: it deduplicates across lenses, runs the one-time global/structural rubric pass, reconciles `rehome`/`reowner` to a single owner (confirming the map stays complete and single-owner), rejects proposals missing their required field, and **rolls the backlog in place** per `proposal-format.md`. The backlog is the only file written.

### 5. Present (main thread)

Summarize what moved, what closed, what was rejected, and recommend the top few proposals to draft next.

## Scratch

Per-role raw outputs and verify transcripts are ephemeral under `.agentsmith/tmp/instruction-review/<round-id>/` (gitignored, never committed), where `<round-id>` is date-based (`<YYYY-MM-DD>[<letter>]`, no target branch -- instruction review has no branch).

## Degradation

Per `#ai-review-engine`: real sub-agents when available; else one agent role-plays each lens sequentially (this is the path `prompts/review-instructions.md` describes as the single-umbrella fallback, its nine dimensions becoming the shared rubric); else a human supplies proposals onto the same schema. One backlog, one rubric.
