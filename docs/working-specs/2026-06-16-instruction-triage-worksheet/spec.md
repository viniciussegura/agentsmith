# Spec: instruction-review triage worksheet + apply command

Status: Approved

## Problem

The instruction-review triage step (SKILL.md step 5) dispositions every verified proposal through `AskUserQuestion`.
Two failure modes, both observed in the 2026-06-16 round (32 proposals):

- **Per-proposal asking** = ~N round trips. Slow, and each round trip is a crash-exposure point (the round crashed twice mid-flight).
- **One grouped adopt-all/park-all/reject-all** question = too coarse. The user could not selectively adopt within a group, so was forced to `park` all 32 even though many were clearly adoptable.

Triage is ~N **independent** human judgments; `AskUserQuestion` (1-4 quick choices) is the wrong instrument for it.

## Approach

Decouple **deciding** from **executing** via an editable, machine-readable worksheet (the `git rebase -i` todo-file pattern):

1. A review round runs setup -> fan-out -> verify -> reduce, then **writes the worksheet and stops** -- it no longer dispositions in-session.
2. The user edits a `decision:` field per proposal in their own editor, at their own pace, offline. Editing a proposal's `draft` body before `adopt` covers the old "adopt-but-reword" / `other` disposition.
3. A **separate command** (`/instruction-apply`) reads the worksheet and executes every decision in one non-stop, **crash-idempotent** pass.

This removes all decision-time round trips, makes the flow resumable (the file is the state), and lets long draft prose be edited in a real editor rather than a chat prompt.

## Goals

- Zero round trips while the human decides.
- Per-proposal granularity (not per-group).
- **Crash-resumable for every decision kind** (see the idempotency model in §3.5): a crash mid-apply loses no decisions and re-applies nothing already done.
- Local-first: the worksheet is gitignored, per-machine, never committed (consistent with `#ai-review-board` persistence).
- The only committed outputs remain: adopted rules in `instructions/`, and decision lines (rejected / folded / deferred) in `docs/instruction-rules-decisions.md`.

## Non-goals

- No change to fan-out / verify / reduce (steps 2-4), the rubric, the scorecard, or the `InstructionProposal` schema. (The worksheet **projects** every schema field that triage needs -- see §1.3 -- so no field is silently lost.)
- No interactive widget in v1 (a tinder-card UI over the same file is a possible later layer, explicitly out of scope here).
- No auto-adoption: `apply` only executes decisions the human wrote into the file.

## Design

### 1. The worksheet artifact

#### 1.1 Path and role
- **Path:** `.agentsmith/instruction-review/triage.md` (gitignored, per-machine). This **replaces** `parked.md`: a `decision: park` entry *is* the parked carry. One file plays both roles -- active worksheet and resting parked queue.

#### 1.2 Parse contract (authoritative grammar -- resolves O2)
The file is parsed, not free-form. The grammar is exact so a hand-edited file stays machine-readable:

- An **entry** begins at a line matching `^### ` and runs until the next `^### ` or EOF.
- The **tag** is the first whitespace-delimited token after `### ` (tags never contain spaces). Any text after it on the heading line is a human label, **not parsed**.
- **Metadata** are `- key: value` lines anywhere in the entry. Authoritative keys: `decision`, `kind`, `role`, `targetFile`, `status`, `blockedOn`, `reason`, `gap`, `proposedFile`, `proposedOwner`, `note`. The bracketed kind/role/targetFile in any heading label is decorative only -- the `- key:` lines are authoritative (removes the `·`/`]` delimiter risk).
- The **draft body** is the **first fenced code block** (```` ``` ````) inside the entry. Its content is taken verbatim, including any `###` lines (rule sections start with `###`; the fence is why that no longer terminates the parse early). An entry with `kind: new-rule`/`strengthen` whose draft fence is missing or unterminated is **malformed** (see §3.2).
- Anything outside these constructs (prose, blank lines, the file's intro) is ignored.

Canonical entry shape:

```
### swe-errors   strengthen · swe · core/swe.md
- decision: park
- kind: strengthen
- role: swe
- targetFile: instructions/core/swe.md
- status: ready
- gap: "context added" undefined -- require naming the operation + key inputs

draft:
``​`
<the adoptable rule text; edit freely before adopt>
``​`
```

`reowner` carries `- proposedOwner:` and no draft; `rehome` carries `- proposedFile:` and no draft; `reason` is required only for `reject`/`fold`; `note` is optional free text (e.g. an apply-failure record).

#### 1.3 Schema projection (resolves status/blockedOn loss)
Every `InstructionProposal` field maps to a worksheet key: `tag`->heading, `kind`/`role`/`targetFile`/`proposedFile`/`proposedOwner`/`gap`/`status`/`blockedOn`->`- key:` lines, `draft`->the fenced block. A `blocked`/`conditional` proposal keeps its `status` and `blockedOn` in the worksheet; `apply` refuses to `adopt` an entry whose `status` is not `ready` (§3.2). No schema field is dropped.

#### 1.4 Decision vocabulary -> sink
The `decision:` value is the single source of truth:

- `park` (default on write) -> stays in the file; re-surfaces next round. (The decide-later sink.)
- `adopt` -> guided adoption into `instructions/` using the entry's (possibly edited) `draft`. Requires `status: ready`.
- `reject` -> a `#tag -- rejected: <reason>` line in the decisions log. Requires `reason`.
- `fold:<tag>` -> a `#tag -- folded into <tag>: <reason>` line in the decisions log. Requires `reason` **and** a resolvable target (§3.2).
- `defer:<condition>` -> a `#tag -- deferred: <condition> (-> <targetFile>, <role>)` line in the decisions log (the committed conditional decision the old `deferred` log type carried; preserved, not dropped). Requires the `<condition>` (and `targetFile`+`role`, §3.2). A deferred tag is thereafter in the decisions log, so §3.5 treats it as resolved and it is not auto-revived; a future full audit re-derives the proposal from scratch (tag-equality dedupe only, per SKILL.md), so the deferral records the decision without permanently suppressing a genuine future re-raise.

Any other / malformed value is a validation error (§3.2). The old `other` disposition is absorbed: "adopt-but-reword" = edit the draft then `adopt`; "fold into an existing tag" = `fold:<tag>`; "merge with another proposal" = edit one draft, `fold` the other into it.

### 2. Round flow change

#### 2.1 Setup: round-id then the parked-check gate
- A `<round-id>` (date-based `<YYYY-MM-DD>`, suffixed `[a]`, `[b]`, ... for a same-day second round) is **minted at the very start of setup, before the gate**, so the archive path in option (i) is always defined and collision-free.
- Then, if `triage.md` exists and is non-empty, present the gate. The prompt **surfaces counts**: `N` total entries and `K` with a non-`park` decision (un-applied decisions). Three options:
  - **(i) Ignore parked** -> archive the existing `triage.md` to `.agentsmith/tmp/instruction-review/<round-id>/triage-prev.md`, then start a fresh worksheet with only this round's new proposals. When `K > 0` the prompt states explicitly "`K` un-applied decisions will be archived, not applied" -- never a silent drop.
  - **(ii) Consider parked** -> merge this round's fresh proposals into the existing file **additively**: a fresh proposal whose `#tag` already has an entry is **dropped** (the existing entry always wins -- never overwrite a hand-edited decision, draft, or note); only brand-new tags are appended. Before merging, drop only existing entries that pass the **kind-aware already-applied check** (§3.5) -- raw tag-presence is **not** used here, so a parked, un-applied `strengthen`/`rehome`/`reowner` (whose tag is live by precondition) is preserved, not deleted. If a done-check is indeterminate (e.g. its `targetFile` is missing), **keep** the entry -- never drop on uncertainty.
  - **(iii) Stop and process** -> abort the audit entirely (no fan-out / verify / reduce). The existing `triage.md` already is an editable worksheet; the handoff tells the user to edit decisions and run `/instruction-apply`. When `K > 0`, recommend this option.
- If `triage.md` is absent or empty, no gate; proceed normally.

#### 2.2 Reduce output + handoff (replaces the in-session disposition loop)
After reduce, the main thread:
- presents the **dimension scorecard** and **mechanical-nits** list inline (unchanged -- never omitted **when reduce runs**; see the invariant note below);
- writes / refreshes `triage.md` with the consolidated proposals, each `decision: park` by default (merged per the gate when option (ii) was chosen);
- **stops**, with an explicit handoff message naming **both** (a) the worksheet path to edit and (b) the exact command `/instruction-apply` to run afterwards.

The in-session `AskUserQuestion` disposition loop is removed. **Scorecard invariant (scoped):** the scorecard is never omitted *when reduce runs*; gate option (iii) runs no reduce and therefore presents no new scorecard -- that is the one sanctioned no-scorecard path, and the handoff says so.

### 3. The apply command (`/instruction-apply`)

#### 3.1 Surface
- A dedicated command `tools/claude/commands/instruction-apply.md` (not an `--apply` flag on `/instruction-review`).
- The procedure lives in a new "Apply pipeline" section of `instruction-review/SKILL.md` (shares the decisions-log format and the kind-branched adoption logic with the round). Mirrors `/review-promote` over `review-board` -- and, with §3.5, shares its idempotent-by-skip property too.

#### 3.2 Validation (one pass, before any write)
Line endings are normalized (`\r?\n`) before parsing -- the repo is Windows/PowerShell, so a trailing `\r` on a `### `, fence, or `- key:` line must not break detection. Read `triage.md`. If absent/empty, report "nothing to apply" and stop. Otherwise validate every entry; a malformed entry is **reported and skipped**, never half-applied:
- **Structural:** a `#tag` appearing in more than one entry heading -> all entries for that tag are malformed (a hand-edit can introduce a duplicate the gate-time dedupe never saw); a duplicated authoritative key within one entry (e.g. two `- decision:` lines) -> malformed (no implicit last-wins); `new-rule`/`strengthen` with a missing or unterminated `draft` fence -> malformed.
- `decision` is one of `park | adopt | reject | fold:<tag> | defer:<condition>`.
- `reject`/`fold` require `reason`; `defer` requires a `<condition>` **and** `targetFile` + `role` (they fill the committed `(-> <targetFile>, <role>)` log suffix -- both are projected from the proposal, §1.3).
- `fold:<tag>` requires a **resolvable target**: `<tag>` is a live `#tag` (in the generated set / `ownership.yaml`) or already present in the decisions log -- else malformed (resolves O4; no dangling fold ever written).
- `adopt` requires `status: ready` and the kind's field: `new-rule`/`strengthen` need a non-empty, terminated `draft` fence; `rehome` needs `proposedFile`; `reowner` needs a resolvable `proposedOwner` (declared role / `swe` base lens / known marker).

#### 3.3 Pre-flight
Before the first adoption, check `instructions/` + `ownership.yaml` for unrelated uncommitted edits; ask the user to stash or commit first. This keeps a **clean base**: with no unrelated edits, any uncommitted change found in `instructions/` is unambiguously apply's own work, so the idempotent re-apply (§3.5) and per-entry snapshot recovery (§3.4) cannot be confused by, or discard, user edits. (No-op when only `adopt`-free decisions are present, since those touch no `instructions/` file.)

#### 3.4 Process (respects `#ai-preflight`; default non-stop -- it is a batch action)
- `adopt` -> apply the entry's intended **end-state declaratively** (per kind, §3.5), then regenerate (`node bin/cli.js`) and run `npm test`. **Must leave `npm test` green** (#swe-done). **Recovery is per-entry, not file-wide:** before touching any file for this entry, snapshot the exact pre-edit content of each file it will change; on an `npm test` failure (or any error) restore those snapshots. This reverts only this entry -- never a sibling adoption that already landed in the same file (many proposals target `core/swe.md`, so a file-wide `git restore` would wrongly wipe an earlier success). Then set the entry's `decision: park`, append a `- note:` with the failure, leave it in the file, and continue. No half-write survives a failure; and because the end-state apply is idempotent (§3.5), no half-write survives a crash either.
- `reject` / `fold` / `defer` -> append the decisions-log line (at most one entry per tag: update in place, never duplicate).
- `park` -> leave in place.

#### 3.5 Idempotency model (resolves crash-resumability for every kind)
Each adopt is applied as a **declarative, idempotent "ensure end-state"** operation: it converges the file(s) to the intended result from *any* starting state -- including a mid-edit partial left by a crash -- and never depends on locating a pre-edit anchor. So re-running after a crash is always safe. The **done-check** below lets apply *skip* an already-satisfied entry as an optimization, but correctness does not rest on it: re-applying a satisfied entry is a no-op by construction. The exact edit mechanics are the plan's to choose; what is normative is the idempotent end-state and that nothing is ever doubled or partially left.

- `new-rule`: ensure the section exists in `targetFile` (add **iff absent** -- never a second copy) and its `ownership.yaml` row exists (add iff absent).
- `strengthen`: ensure the tag's **section** (the text from its `### #tag ...` heading to the next `###` or EOF) **equals** the `draft` -- i.e. replace the whole section with the draft; if the section is absent (e.g. a crash deleted the heading), add it (the empty-section case of the ensure). Whole-section replacement is correct from any partial state and never false-positives on prose the draft legitimately shares with the original (this closes the substring-overlap hole).
- `rehome`: ensure the section is present in `proposedFile` (add iff absent) **and** absent from the old `targetFile` (remove iff present) -- each sub-step idempotent, so a crash between them converges on re-run with no duplicate copy and no lost text.
- `reowner`: ensure the `ownership.yaml` row exists with its **resolved owner** equal to `proposedOwner` -- add the row iff absent (covers the setup orphan-assignment case, where an unowned tag has no row yet), else rewrite its owner (a re-write of the same value is a no-op; the comparison is on the resolved owner value, not raw line text).
- `reject` / `fold` / `defer`: ensure the tag's decisions-log line exists with the matching disposition (one line per tag, update-in-place) -- inherently idempotent.

Combined with per-entry removal (§3.6), the whole pass is crash-idempotent for every kind: a crash leaves the entry present; the re-run re-converges the end-state (or skips via the done-check). The same ensure/skip logic is what the gate-(ii) prune uses (§2.1), so a parked, not-yet-applied `strengthen`/`rehome`/`reowner` is never silently dropped.

#### 3.6 Per-entry commit + report
On each successful `adopt`/`reject`/`fold`/`defer`, **remove that entry from `triage.md` immediately** (so the file always holds exactly the not-yet-applied entries). Decisions-log appends are append-only and never reverted (safe per §3.5). After the pass, `park` entries (and any adopt that failed and was re-parked with a `note`) remain in `triage.md` as the carry. A re-parked failure now carries `decision: park`, so retrying it is a deliberate act -- the user re-edits it back to `adopt` (it does not auto-retry on the next apply). Report a summary: adopted / rejected / folded / deferred / parked / failed (each failure with its reason).

### 4. Hardcoded reference strings (normative -- pinned by this spec)

- Worksheet path: `.agentsmith/instruction-review/triage.md`
- Archive on "ignore parked": `.agentsmith/tmp/instruction-review/<round-id>/triage-prev.md`
- Apply command: `/instruction-apply`
- Decision values: `park` | `adopt` | `reject` | `fold:<tag>` | `defer:<condition>`
- Metadata keys: `decision`, `kind`, `role`, `targetFile`, `status`, `blockedOn`, `reason`, `gap`, `proposedFile`, `proposedOwner`, `note`
- Draft delimiter: the first fenced code block within an entry
- Decisions log (unchanged): `docs/instruction-rules-decisions.md`

## Acceptance criteria

"Clean state" below = no `triage.md` present and a clean working tree for `instructions/` + `ownership.yaml`.

1. From a clean state, `/instruction-review` produces `.agentsmith/instruction-review/triage.md` with every consolidated proposal at `decision: park` (each carrying its projected `kind`/`role`/`targetFile`/`status` and a fenced `draft` where applicable), presents the scorecard + nits, and stops with a handoff naming the file and `/instruction-apply`. No `AskUserQuestion` disposition loop runs.
2. Editing entries to `adopt`/`reject`/`fold`/`defer` and running `/instruction-apply` applies exactly those: adopts land in `instructions/` with `npm test` green; reject/fold/defer land in the decisions log (one line per tag); untouched `park` entries remain.
3. Applied entries are removed from `triage.md`; re-running `/instruction-apply` is a no-op over them. Simulating a crash (re-running after a partial pass) re-applies nothing already done and completes the rest (§3.5).
4. A second `/instruction-review` with a non-empty `triage.md` presents the gate with the `N`/`K` counts and behaves per the chosen option; "ignore" archives the prior file to the named tmp path with the `K`-count surfaced; option (iii) runs no fan-out and presents no scorecard.
5. An `adopt` whose `npm test` fails is reverted (no half-write), re-parked with a `note`, and the pass continues.
6. A `fold:<missing-tag>` and an `adopt` with `status: blocked` are both flagged malformed and skipped, with no decisions-log or `instructions/` change for them.
7. Nothing in `instructions/` or the decisions log changes from a round alone (a round only writes the gitignored worksheet); those change only via `/instruction-apply`.
8. **Mid-entry crash + same-file isolation.** A `strengthen` re-run from a *mid-edit partial* (its section left neither original nor final) converges to exactly the draft (whole-section replace, §3.5); a `strengthen` whose section already equals the draft is a no-op. A `rehome` re-run from either mid-move partial (in both files / in neither) converges to "in `proposedFile` only" with no duplicate. When two adopts target the same `targetFile` and the second fails `npm test`, the first's adoption is preserved and only the second reverts (per-entry snapshot, §3.4). A `triage.md` with the same `#tag` in two entry headings is flagged malformed and neither is applied.

## Resolved open questions (decisions, not deferrals)

- **O1 (npm-test cost):** per-adoption `npm test` is the contract (honors #swe-done). ~130s each; apply runs unattended/batch, so the cost is acceptable. Not optimized in v1.
- **O2 (parse fragility):** resolved by the §1.2 grammar (fenced-block drafts, `- key:` authoritative metadata) plus the §3.2 structural validation (duplicate-tag / duplicate-key / unterminated-fence -> malformed; `\r?\n` normalization for Windows).
- **O4 (fold target):** resolved -- `fold` target must be resolvable (§3.2).
- **O5 (single-session re-run):** v1 contract -- one worksheet per machine. A second round in the same session before apply re-runs the §2.1 gate, whose `K`-count warning protects un-applied edits.

## Remaining open question

- **O3 (migration):** the current `.agentsmith/instruction-review/parked.md` is a **different format** (grouped table + `A1`-`A9` draft appendix), so converting it to `triage.md` is a real transform, not a rename. Decide in the plan: convert the 32 entries (table rows -> sections, appendix drafts -> inline fences) or discard them (a fresh round re-derives them). Recommendation: convert, since the drafts are already house-styled.

## Out of scope (deferred to the plan)

- The prose rewrites of `instruction-review/SKILL.md` (steps 1, 5, the new Apply pipeline), `proposal-format.md` (triage/decisions-log section, keeping the `deferred` line type), the new `commands/instruction-apply.md`, and any `#ai-instruction-review` charter wording in `instructions/authoring/instruction-review.md`.
- The `parked.md` -> `triage.md` migration mechanics (per O3).
