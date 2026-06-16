---
name: instruction-review
description: Run a per-role audit of an instruction set (instructions/ + the generated AGENTS.md), proposing missing or weak rules through each role's lens. Use when the user runs /instruction-review, or asks to audit/review the instruction rules. Opens on the ownership coverage lint, fans out per role, verifies each proposal, an editor reduce consolidates and writes an editable triage worksheet; the separate /instruction-apply command applies the human's decisions. Proposes, then adopts only what the human accepts (#swe-done).
---

# Instruction review

Run one round of the instruction-review application of agentsmith's review engine (`#ai-review-engine`, `#ai-instruction-review`).
It reviews an **instruction set** -- in this repo, `instructions/` plus the generated `AGENTS.md` (read via `node bin/cli.js --stdout`, so the audit reflects the inlined output consumers receive).
It **proposes, then triages via an editable worksheet**: a round runs setup -> fan-out -> verify -> reduce, then writes the triage worksheet `.agentsmith/instruction-review/triage.md` and **stops** -- it does not disposition in-session. The round's open queue, drafts, scorecard, and nits are ephemeral (under `.agentsmith/`, never committed). The human edits each entry's `decision` in the worksheet, then runs the separate `/instruction-apply` command (the **Apply pipeline** below), which writes the single committed output -- the decisions log `docs/instruction-rules-decisions.md` -- and adopts accepted rules into `instructions/` (#swe-done), never a blind write.
Schema, rubric, and the decisions-log format are in `proposal-format.md`; read it before reducing.

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
- **Mint the `<round-id>`** first (date-based `<YYYY-MM-DD>`, suffixed `[a]`, `[b]`, ... for a same-day second round) so the archive path below is always defined.
- **Parked-check gate.** If the worksheet `.agentsmith/instruction-review/triage.md` exists and is non-empty, present a three-option gate before auditing -- surface the counts `N` (total entries) and `K` (entries with a non-`park` decision, i.e. un-applied):
  - **Ignore parked** -> archive the worksheet to `.agentsmith/tmp/instruction-review/<round-id>/triage-prev.md` (when `K > 0`, state "K un-applied decisions archived, not applied" -- never a silent drop), then start a fresh worksheet with only this round's new proposals.
  - **Consider parked** -> merge this round's fresh proposals additively: a fresh proposal whose `#tag` already has an entry is dropped (the existing entry always wins -- never overwrite a hand-edited decision/draft/note). Before merging, drop only existing entries that pass the Apply pipeline's already-applied check (**not** raw tag-presence; keep an entry whose check is indeterminate).
  - **Stop and process** -> abort the audit entirely (no fan-out / verify / reduce); the worksheet already is editable -- hand off to `/instruction-apply`. Recommend this when `K > 0`.

  If the worksheet is absent or empty, no gate; proceed.
- **Open by running the ownership coverage lint** (`npm test`'s ownership check, or `ownershipCoverage` over `instructions/ownership.yaml` + `roles.yaml`) as the round's **first finding source**: any orphan (unowned) or double-owned `#tag` becomes the round's first proposal(s) -- a `reowner`/`new-rule` to assign or de-conflict an owner, since an unowned rule is one no lens would cover. This is propose-only: record the orphan as a proposal and proceed; the hard CI gate against orphans is the coverage-lint test, not this round.
- Resolve the participating role set (above).

### 2. Fan-out (parallel, one sub-agent per participating role, cheap model)

Each role reviews the instruction set through its lens, emitting `InstructionProposal`s for: (a) **coverage** -- a rule its domain expects that is missing or too weak; (b) **per-lens quality** -- clarity, terseness, efficiency, enforceability of rules in its domain; (c) **ownership & placement** -- whether a rule it owns (or believes belongs to its lens) is owned by the right role and in the best file, proposing `rehome`/`reowner` where not.
The global/structural rubric dimensions are **not** per-lens; they run once in reduce (step 4).

### 3. Verify (adversarial, parallel, per proposal, cheap model)

Spawn one `review-verifier` per proposal, biased to reject: confirm the gap is **real and not already covered** by a live `#tag` (re-read the generated output and grep tags). Drop rejected proposals.

### 4. Reduce (instruction-editor, strong model)

Spawn `instruction-editor` with the verified proposals: it deduplicates across lenses, reconciles `rehome`/`reowner` to a single owner (confirming the map stays complete and single-owner), rejects proposals missing their required field, and prepares the consolidated proposal set for triage. It does **not** write rule text anywhere, and the round touches no committed file: the decisions log `docs/instruction-rules-decisions.md` is written later by `/instruction-apply`, per the human's worksheet decisions.
It then **accounts for every rubric dimension** (`proposal-format.md`): consolidate the per-lens verdicts from the role outputs, run the one-time global/structural rubric pass (cohesiveness, self-reference, lean-split, normative voice), and do the mechanical-nits sweep -- producing the **dimension scorecard** and nits list. These are ephemeral (presented, not committed).

### 5. Reduce output + handoff (main thread)

Present the **dimension scorecard** (a Strong/Good/Weak/Gaps verdict per rubric dimension, with `file`/`#tag` citations) and the **mechanical-nits** list. The scorecard is never omitted **when reduce runs**; the setup gate's *Stop and process* path runs no reduce and so presents no new scorecard -- that is the one sanctioned no-scorecard path.

Then write / refresh the triage worksheet `.agentsmith/instruction-review/triage.md` with the consolidated proposals and **stop**. The round does **not** disposition in-session; the human edits decisions in the worksheet and runs `/instruction-apply`. Nothing in `instructions/` or the decisions log changes from a round alone.

Worksheet format -- one `### <tag>` section per proposal:

- The tag is the first token after `### `. `- key:` lines are authoritative (the bracketed label after the tag is decorative): `decision` (default `park`), `kind`, `role`, `targetFile`, `status`, `blockedOn`, `gap`, and `proposedFile`/`proposedOwner` for `rehome`/`reowner`. Every `InstructionProposal` field is projected -- nothing is dropped (a `blocked`/`conditional` proposal keeps its `status`/`blockedOn`).
- The draft is the **first fenced code block** in the entry, fenced with **more backticks than any fence inside it** (use a 4-backtick fence so a draft may contain a 3-backtick code block). `new-rule`/`strengthen` carry a draft; the human edits it freely before `adopt`.
- Default every entry's `decision: park` (merged per the setup gate when *Consider parked* was chosen).

End with a handoff message naming **both** the worksheet path and the next command: `/instruction-apply`.

## Apply pipeline (`/instruction-apply`)

A separate command consumes the worksheet and executes every decision in one non-stop, **crash-idempotent** pass. The round only *writes* the worksheet; this is where `instructions/` and the decisions log change.

Worksheet path: `.agentsmith/instruction-review/triage.md` (gitignored, per-machine). Decision vocabulary -> sink: `park` (default; stays, re-surfaces next round) · `adopt` (the draft, into `instructions/`) · `reject` / `fold:<tag>` / `defer:<condition>` (the decisions log).

### A1. Validate (one pass, before any write)

Normalize line endings (`\r?\n` -- the repo is Windows). If the worksheet is absent/empty, report "nothing to apply" and stop. Validate every entry; a malformed entry is **reported and skipped**, never half-applied:

- Structural: a `#tag` in more than one entry heading -> all its entries malformed; a duplicated authoritative key in one entry -> malformed; a `new-rule`/`strengthen` with a missing or unterminated draft fence -> malformed.
- `decision` is one of `park | adopt | reject | fold:<tag> | defer:<condition>`.
- `reject`/`fold` need `reason`; `defer` needs a `<condition>` plus `targetFile` + `role` (they fill the `(-> <targetFile>, <role>)` log suffix).
- `fold:<tag>` needs a **resolvable target** (a live `#tag` or an existing decisions-log entry) -- no dangling fold.
- `adopt` needs `status: ready` and the kind's field: `new-rule`/`strengthen` a non-empty draft; `rehome` a `proposedFile`; `reowner` a resolvable `proposedOwner` (declared role / `swe` base lens / known marker).

### A2. Pre-flight (clean base)

Before the first adoption, check `instructions/` + `ownership.yaml` for unrelated uncommitted edits; ask the user to stash or commit first. This keeps a clean base so the idempotent re-apply and per-entry snapshot recovery cannot confuse or discard user edits. (No-op when no entry is `adopt`.)

### A3. Process (non-stop; respects `#ai-preflight`)

Each adopt is applied as a **declarative, idempotent ensure-end-state** -- it converges the file from any starting state (including a crash partial), never depending on a pre-edit anchor; the optional done-check just lets it skip an already-satisfied entry:

- `new-rule`: ensure the section exists in `targetFile` (add **iff absent** -- never a second copy) and its `ownership.yaml` row exists (add iff absent).
- `strengthen`: ensure the tag's section (its `## #tag ...` heading to the next `##` heading or EOF) **equals** the draft -- replace the whole section (add it if absent). Whole-section replacement is correct from any partial and never false-positives on prose the draft shares with the original.
- `rehome`: ensure the section is present in `proposedFile` (add iff absent) **and** absent from the old `targetFile` (remove iff present).
- `reowner`: ensure the `ownership.yaml` row exists with its **resolved owner** equal to `proposedOwner` (add iff absent, else rewrite owner).
- `reject` / `fold` / `defer`: ensure the tag's decisions-log line exists with the matching disposition -- `#tag -- rejected: <reason>` / `folded into <tag>: <reason>` / `deferred: <condition> (-> <targetFile>, <role>)`. One line per tag, update in place.

After each adopt, regenerate (`node bin/cli.js`) and run `npm test`; it **must stay green** (#swe-done). **Recovery is per-entry, not file-wide:** snapshot each file's pre-edit content before touching it; on an `npm test` failure (or any error) restore only those snapshots -- never wipe a sibling adoption that already landed in the same file (many rules live in `core/swe.md`, so a file-wide `git restore` would be wrong). Then set the entry `decision: park`, append a `- note:` with the failure, and continue.

### A4. Commit + report

On each successful `adopt`/`reject`/`fold`/`defer`, **remove that entry from the worksheet immediately** (so it always holds exactly the not-yet-applied entries; a crash resumes by re-running -- the already-applied entries are gone, and the ensure-end-state makes any re-touch a no-op). Decisions-log appends are append-only. `park` entries (and any re-parked failure, now `decision: park` -- retrying it is a deliberate re-edit to `adopt`) remain as the carry. Report: adopted / rejected / folded / deferred / parked / failed (each failure with its reason).

## Scratch

Per-role raw outputs and verify transcripts are ephemeral under `.agentsmith/tmp/instruction-review/<round-id>/` (gitignored, never committed), where `<round-id>` is date-based (`<YYYY-MM-DD>[<letter>]`, no target branch -- instruction review has no branch).

## Degradation

Per `#ai-review-engine`: real sub-agents when available; else one agent role-plays each lens sequentially (this is the path `prompts/review-instructions.md` describes as the single-umbrella fallback, its nine dimensions becoming the shared rubric); else a human supplies proposals onto the same schema. One decisions log, one rubric.
