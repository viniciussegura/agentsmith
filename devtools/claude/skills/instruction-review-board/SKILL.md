---
name: instruction-review-board
description: Run a per-role audit of an instruction set (instructions/ + the generated AGENTS.md), proposing missing or weak rules through each role's lens. Use when the user runs /instruction-review-board, or asks to audit/review the instruction rules. Opens on the ownership coverage lint, fans out per role, verifies each proposal, an ai-engineer reduce consolidates and writes an editable triage worksheet; the separate /instruction-apply command applies the human's decisions. Proposes, then adopts only what the human accepts (#swe-done).
---

# Instruction review

Run one round of the instruction-review application of agentsmith's review engine (`#ai-review-engine`, `#ai-instruction-review`).
It reviews an **instruction set** -- in this repo, `instructions/` plus the generated `AGENTS.md` (read via `node bin/cli.js --stdout`, so the audit reflects the inlined output consumers receive).
It **proposes, then triages via an editable worksheet**: a round runs setup -> fan-out -> verify -> reduce, then writes the structured triage worksheet `.agentsmith/instruction-review/triage.json` and **stops** -- it does not disposition in-session. The round's open queue, drafts, scorecard, and nits are ephemeral (under `.agentsmith/`, never committed). The human triages each entry's `decision` in the worksheet (by hand or in the `npm run triage` UI), then runs the separate `/instruction-apply` command (the **Apply pipeline** below), which writes the single committed output -- the decisions log `docs/instruction-rules-decisions.md` -- and adopts accepted rules into `instructions/` (#swe-done), never a blind write.
Schema, rubric, and the decisions-log format are in `proposal-format.md`; read it before reducing.

## When to run

- The user invokes `/instruction-review-board`, or asks to audit/review the instruction rules.

## Relationship to the shared engine

This is the **instruction application** of agentsmith's shared review round (`#ai-review-engine`), whose field-level contract is canonical in `docs/reference-spec/review-board-protocol.md`. The round shape -- `[Plan] -> Review -> [Verify] -> Reduce -> Persist` -- and the role registry are the same as the code-review board; the per-application differences are carried by the `instructionArgs(ctx)` builder in `round-args.mjs` (`board: 'instruction'`, `maintainer: 'ai-engineer'`, `plan` enabled, `verify: true`, the worksheet reduce prompt). The same round runs two ways: this SKILL is the **main-thread driver** (the prose below), and `/instruction-review-board-wf` runs the **Workflow driver** (`board-round.mjs`) deterministically with identical args — parity is by construction (both consume `instructionArgs`).

What differs from code review: the **subject** is the instruction set (a full audit -- there is no `diff` variant in v1), the **schema** is `InstructionProposal` (not `Issue`), the **maintainer** is `ai-engineer` (plan + reduce), and **persistence is the triage worksheet** `.agentsmith/instruction-review/triage.json` then the decisions log `docs/instruction-rules-decisions.md` via `/instruction-apply` (no issue store, no round store, no commit baseline).
Each reviewer persona is application-neutral; your spawn prompt supplies the instruction set as subject and names `InstructionProposal` as the output schema.

## Participants

Not every code lens maps to instruction rules, so role **participation** is per-application. The default participating set is `swe`, `security`, `db`, `qa`, `docs`, `frontend`, `ux`, `ai`, `git` (`correctness` audits code, not rules, so it does not participate). `ai` and `git` are meta lenses that exist **only** here -- they own the agent-behavior and VCS-workflow process rules and never run in a code-review round. A repo that also runs the board may override this under an `instruction-review.participants` key in `.agentsmith/review-board/config.yaml`; a repo with no board uses this skill default. The two applications never share config shape -- only the optional file.

## Round pipeline

### 1. Setup (main thread)

- The subject is the whole instruction set; a round always runs a **full audit**.
- **Mint the `<round-id>`** first (date-based `<YYYY-MM-DD>`, suffixed `[a]`, `[b]`, ... for a same-day second round) so the archive path below is always defined.
- **Parked-check gate.** If the worksheet `.agentsmith/instruction-review/triage.json` exists and has entries, present a three-option gate before auditing -- surface the counts `N` (total entries) and `K` (entries whose `decision.verdict` is a terminal `adopt|reject|fold|defer`, i.e. un-applied; `park` and `refine` are **excluded** from `K`):
  - **Ignore parked** -> archive the worksheet to `.agentsmith/instruction-review/triage.prev.json` (when `K > 0`, state "K un-applied decisions archived, not applied" -- never a silent drop), then start a fresh worksheet with only this round's new proposals.
  - **Consider parked** -> merge this round's fresh proposals additively, deduped in JSON terms: a fresh proposal whose tag is already **live in `node bin/cli.js --stdout`** or recorded in the **decisions log** is dropped; an indeterminate one is kept. A fresh proposal whose tag matches an existing `triage.json` entry is dropped (the existing, possibly hand-edited, entry wins) -- **except** it **replaces** an entry that is **untouched and still blocked** (`decision.verdict === 'park'` with empty `details` and `status.state !== 'ready'`), letting a now-resolved block re-enter as `ready`. A `park` entry carrying human `details` counts as hand-edited and is never overwritten.
  `scorecard` is overwritten with the new round's (the old one described a prior subject and would be stale).
  `candidates` merge by tag: a fresh candidate whose tag is already live or in the decisions log is dropped; a fresh candidate whose tag matches an existing entry is dropped (the drafted entry wins); a fresh candidate whose tag matches an existing candidate replaces it unless that candidate was hand-edited (`wanted` or `reject` verdict), which is preserved; a fresh entry whose tag matches an existing candidate drops that candidate (the drafted entry wins); candidates not revisited this round survive.
  - **Stop and process** -> abort the audit entirely (no fan-out / verify / reduce); the worksheet already is editable -- hand off to `/instruction-apply`. Recommend this when `K > 0`.

  If the worksheet is absent or has no entries, no gate; proceed.
- **Open by running the ownership coverage lint** (`npm test`'s ownership check, or `ownershipCoverage` over `instructions/ownership.yaml` + `roles.yaml`) as the round's **first finding source**: any orphan (unowned) or double-owned `#tag` becomes the round's first proposal(s) -- a `reowner`/`new-rule` to assign or de-conflict an owner, since an unowned rule is one no lens would cover. This is propose-only: record the orphan as a proposal and proceed; the hard CI gate against orphans is the coverage-lint test, not this round.
- Resolve the participating role set (above) -- this is the round's **candidate** lens set.

### 1b. Plan (ai-engineer, strong model)

Spawn `ai-engineer` (the maintainer's **plan** duty) with the candidate lens set and the ownership-coverage-lint output (presented as untrusted DATA): it returns `{lenses, perLens}` -- the subset of lenses to actually consult and a per-lens focus map (e.g. concentrating the owning lens on a lint orphan). It must not merely echo the candidate set. The fan-out below runs the **maintainer-chosen** lenses, not the raw candidate set. (In the `-wf` driver this is the Plan phase of `board-round.mjs`; the lint output is the kickstart's `plannerInputs` DATA.)

### 2. Fan-out (parallel, one sub-agent per planned role, cheap model)

Roles and the verifier carry the Write tool (they write their own `findings/<role>.json` / `verdicts/`), so **before spawning** snapshot the git baseline for the containment guard: `node .claude/skills/code-review-board/round-guard.mjs snapshot .agentsmith/tmp/instruction-review/<round-id>/git-baseline.txt`. Step 5 checks it.

Each role reviews the instruction set through its lens, emitting `InstructionProposal`s for: (a) **coverage** -- a rule its domain expects that is missing or too weak; (b) **per-lens quality** -- clarity, terseness, efficiency, enforceability of rules in its domain; (c) **ownership & placement** -- whether a rule it owns (or believes belongs to its lens) is owned by the right role and in the best file, proposing `rehome`/`reowner` where not.
The global/structural rubric dimensions are **not** per-lens; they run once in reduce (step 4).

### 3. Verify (adversarial, parallel, per proposal, cheap model)

Spawn one `review-verifier` per proposal, biased to reject: confirm the gap is **real and not already covered** by a live `#tag` (re-read the generated output and grep tags). Drop rejected proposals.

### 4. Reduce (ai-engineer, strong model)

Spawn `ai-engineer` (the maintainer's reduce duty) with the verified proposals: it deduplicates across lenses, reconciles `rehome`/`reowner` to a single owner (confirming the map stays complete and single-owner), rejects proposals missing their required field, and prepares the consolidated proposal set for triage. It does **not** write rule text anywhere, and the round touches no committed file: the decisions log `docs/instruction-rules-decisions.md` is written later by `/instruction-apply`, per the human's worksheet decisions.
It then **accounts for every rubric dimension** (`proposal-format.md`): consolidate the per-lens verdicts from the role outputs, run the one-time global/structural rubric pass (cohesiveness, self-reference, lean-split, normative voice), and do the mechanical-nits sweep -- producing the **dimension scorecard** and nits list. These are ephemeral (presented, not committed).

### 5. Reduce output + handoff (main thread)

**Containment check first.** Run `node .claude/skills/code-review-board/round-guard.mjs check .agentsmith/tmp/instruction-review/<round-id>/git-baseline.txt`. A round writes only the gitignored worksheet, so a non-zero exit means a role/verifier wrote outside scratch — stop, inspect, and revert before presenting.

Present the **dimension scorecard** (a Strong/Good/Weak/Gaps verdict per rubric dimension, with `file`/`#tag` citations -- each cell is the worst of its per-rule findings, Strong when none) and the **mechanical-nits** list. The scorecard is never omitted **when reduce runs**; the setup gate's *Stop and process* path runs no reduce and so presents no new scorecard -- that is the one sanctioned no-scorecard path.

**Archive the prior scorecard for trend arrows.** Before overwriting the worksheet, if the existing `triage.json` carries a `scorecard`, copy that prior worksheet's `{round, scorecard}` to the sibling `.agentsmith/instruction-review/triage.prev.json` (gitignored). The triage UI reads it to render per-cell trend arrows (this round vs the previous). This applies on every reduce path; the setup gate's *Ignore parked* option already archives the whole worksheet to the same path, and *Stop and process* runs no reduce, so it neither overwrites nor re-archives. No prior scorecard (first round / wiped store) simply means no arrows.

Then write / refresh the triage worksheet `.agentsmith/instruction-review/triage.json` with the consolidated proposals and **stop**. The round does **not** disposition in-session; the human triages in the worksheet (by hand or in the `npm run triage` UI) and runs `/instruction-apply`. Nothing in `instructions/` or the decisions log changes from a round alone.

Worksheet format -- a structured JSON file (schema + validator in `devtools/triage-ui/schema.mjs`), written via the canonical serializer (sorted keys, 2-space indent). Shape:

```ts
{ round: string, scorecard: Scorecard | null, candidates: Candidate[], entries: Entry[] }
```

The skill writes all three: `scorecard` from the ai-engineer (the dimension matrix), `candidates` with each undrafted proposal carrying an assigned `priority` (high|medium|low) and `decision` defaulting to `{verdict:'park'}` and no `draft`, and `entries` with full drafts.

Each `Entry` carries the common fields `{ tag, role, targetFile, status, gap, decision, applyLog }` plus its per-kind content:

- `status` = `{state:'ready'}` | `{state:'blocked', blockedOn}` | `{state:'conditional', blockedOn}` (the proposal's readiness; `blockedOn` required on the two non-ready states).
- `decision` = the human verdict, defaulting to `{ verdict: 'park' }`; the round emits **all entries parked** (the human triages later). Verdicts: `park | adopt | reject | fold | defer | refine`. `reject`/`defer`/`refine` need `details`; `fold` needs `foldTarget` (a `#tag`) **and** `details`.
- `applyLog: []` -- empty; `/instruction-apply` appends failure records here.
- `gap` -- the gap (the proposal's one-line `rationale` is folded into it).
- **Per kind:** `new-rule` carries `draft` (no `current`); `strengthen` carries `current` (the **verbatim live `## #tag` section** the draft replaces) **and** `draft`; `rehome` carries `proposedFile` (+ `current`/`draft` only if the text changes); `reowner` carries `proposedOwner`.

`current` is review-surface only -- `/instruction-apply` never reads it. The UI renders `current` vs `draft` as a before/after diff; for `new-rule` there is no `current` (pure addition).

End with a handoff message naming **both** the worksheet path and the next command: `/instruction-apply` (or `npm run triage` for the UI).

## Apply pipeline (`/instruction-apply`)

A separate command consumes the worksheet and executes every decision in one non-stop, **crash-idempotent** pass. The round only *writes* the worksheet; this is where `instructions/` and the decisions log change.

Worksheet path: `.agentsmith/instruction-review/triage.json` (gitignored, per-machine). The decision is a typed object `decision.verdict` (default `park`): `adopt` (the draft, into `instructions/`) · `reject` / `fold` / `defer` (the decisions log) · `refine` (surfaced for discussion, no write) · `park` (stays, re-surfaces next round). Parameters are typed fields: `decision.details` (reject reason / defer condition / refine question) and `decision.foldTarget` (fold); `decision.lastRoundReply` carries the prior answer for `refine` entries.

The pipeline is implemented by `devtools/triage-ui/apply.mjs` (shared with the triage UI's POST /api/apply). The `/instruction-apply` command runs `node devtools/triage-ui/apply.mjs` and reports its output; it does **not** hand-edit files itself -- except for the `wanted`-candidate promotion step described below, which is the explicit exception.

### A1. Validate (one pass, before any write)

`JSON.parse` the file. If absent or `entries` is empty, report "nothing to apply" and stop. Validate every entry with `devtools/triage-ui/schema.mjs` (`validateFile` + `validateCrossRefs`); a malformed entry is **reported and skipped**, never half-applied:

- **Structural (`validateFile`):** each kind's required content field (`new-rule`/`strengthen` -> `draft`; `rehome` -> `proposedFile`; `reowner` -> `proposedOwner`); `status` union (`blocked`/`conditional` need `blockedOn`); `decision` union (`reject`/`defer`/`refine`/`fold` need `details`; `fold` needs `foldTarget`); `applyLog` a string[]; no duplicate `tag`. (`current` is no longer a stored field -- the engine reads the live file from disk.)
- **Cross-reference (`validateCrossRefs`):** `fold.foldTarget` must resolve to a **live `#tag`** (from `node bin/cli.js --stdout`); `reowner.proposedOwner` must be a resolvable owner (declared role / `swe` base lens / known marker, from `roles.yaml`).
- `adopt` additionally requires `status.state === 'ready'` (a `blocked`/`conditional` entry cannot be adopted until re-emitted ready).

### A2. Pre-flight (clean base)

Before the first adoption, check `instructions/` + `ownership.yaml` for unrelated uncommitted edits; ask the user to stash or commit first. (No-op when no entry is `adopt`.)

### A3. Process (non-stop; respects `#ai-preflight`)

The engine processes each entry by verdict. Instructions are now **one file per tag** under group dirs (e.g. `instructions/core/swe/swe-errors.md`), each group with an `_intro.md`. An `adopt` is therefore a **whole-file write/create**, not a section splice:

- `new-rule`: write or create the tag's rule file in its group dir and ensure its `ownership.yaml` row exists (add iff absent).
- `strengthen`: write the tag's rule file with the `draft` content (replace whole file; add iff absent).
- `rehome`: write the file in `proposedFile`'s group dir and remove it from `targetFile`'s group dir.
- `reowner`: ensure the `ownership.yaml` row exists with `proposedOwner` (add iff absent, else rewrite owner).
- `reject` / `fold` / `defer`: ensure the tag's decisions-log line exists in the **canonical grammar** of `docs/instruction-rules-decisions.md` (tag backtick-wrapped), reason from `decision.details`: `` `#tag` -- rejected: <details> `` / `` `#tag` -- folded into `<foldTarget>`: <details> `` / `` `#tag` -- deferred: <details> (-> <basename(targetFile)>, <role>) `` (the defer hint uses the file **basename** and `role` from the entry). One line per tag, update in place.
- `refine`: write nothing; **leave the entry** and surface `decision.details` + `decision.lastRoundReply` in the report so discussion can happen this turn. Resolved only when the human re-sets the verdict to a terminal one.
- `park` (default): leave the entry.
- `rehome` / `reowner`: **skipped** (deferred to a future engine version); reported as `skipped`.

After each adopt, regenerate (`node bin/cli.js`) and gate on `node --test` (#swe-done). **Recovery is per-entry, not file-wide:** snapshot pre-edit content; on failure restore only those snapshots, set the entry's `decision` to `{ verdict: 'park' }`, and push the failure string to `entry.applyLog` (rewrite via canonical serializer); continue.

### A4. Commit + report

On each successful terminal verdict (`adopt`/`reject`/`fold`/`defer`), **splice that entry from `entries[]` and rewrite the whole file atomically** (temp + rename) via the canonical serializer, so `triage.json` always holds exactly the not-yet-applied entries; a crash resumes by re-running (ensure-end-state makes any re-touch a no-op). `park`, `refine`, and re-parked failures remain as the carry. Report: adopted / rejected / folded / deferred / **refined** / parked / **skipped** / failed (each failure with its reason). The setup gate's `K` counts only the applyable terminals (adopt/reject/fold/defer); `park` and `refine` are **not** counted in K.

## Scratch

Per-role raw outputs and verify transcripts are ephemeral under `.agentsmith/tmp/instruction-review/<round-id>/` (gitignored, never committed), where `<round-id>` is date-based (`<YYYY-MM-DD>[<letter>]`, no target branch -- instruction review has no branch).

## Degradation

Per `#ai-review-engine`: real sub-agents when available; else one agent role-plays each lens sequentially (this is the path `prompts/review-instructions.md` describes as the single-umbrella fallback, its nine dimensions becoming the shared rubric); else a human supplies proposals onto the same schema. One decisions log, one rubric.
