# Instruction-set terminology audit: default branch, ship/land, actor noun

Status: Implemented

## Problem

`instructions/main.md` fixes a three-altitude **noun** vocabulary (`deliverable` / `unit of work` / `plan step`), landed by the branch that added `#swe-branch-lifespan`.
That branch fixed only the clash it hit and deferred the rest to `docs/future-work/2026-07-22-instruction-set-terminology-audit.md`.

An inventory over `instructions/` found seven clusters.
Three carry live defects, three are mechanical, one is a false positive.

**Counting unit.** Every `(×N)` in this spec counts **occurrences** of a stated word-boundary pattern, case-insensitive, not lines -- several lines carry two or three.
Where a line count is also useful it is given separately.

### D1. `` `main` `` is used as a rule referent, not as an example

Pattern: the backtick-quoted token `` `main` ``.
Eight occurrences over eight lines, all rule referents: `#git-branch-workflow` lines 5, 6, 7, 8, 9, 16; `#swe-done`:26; `#be-api-versioning`:9.
The set installs into consumer projects whose default branch may be `master` or `trunk`, so a rule saying "never commit directly to `` `main` ``" is silent for them.

`#git-branch-workflow` line 9 is the acute case -- *"**Never** commit directly to `` `main` `` or the default branch"* -- which asserts the two are different things.

Verified false positives under the *unquoted* `\bmain\b` pattern, which is why D1 uses the quoted form: `main thread` / `main-thread driver` (`#ai-review-engine` ×3, `#ai-spec-review`, `#ai-preflight`) and the `main-content` landmark (`#front-a11y`).
Recorded so a later reader does not re-raise them.

Outside `instructions/`, `` `main` `` also appears as a **schema enum value** -- see the carve-out in Design B.

### D2. `ship` and `land` each name two altitudes at once

`#swe-branch-lifespan` line 7 defines the term: *"Work is shipped only once the branch merges to the default branch."*

Pattern: `\b(ship|ships|shipped|shipping|land|lands|landed|landing)\b`, case-insensitive, over `instructions/**/*.md`.
**33 occurrences over 30 lines**, classified exhaustively below; the four buckets sum to 33.

Two things the pattern deliberately does not match, recorded so a later reader does not re-derive them as arithmetic errors:

- the `landmark` substring in `#front-a11y` -- no word boundary, so not a `land` occurrence;
- a word inside markdown underscore emphasis, because `_` is a word character. The corpus has exactly one: `#swe-branch-lifespan`:19's `_When to ship_`, a genuine deliverable-altitude use that is correct as it stands and needs no edit;
- a prefixed word, which has no left boundary. The corpus has exactly one: `#swe-branch-lifespan`:29's `unshipped`.

Two of the three sit in `#swe-branch-lifespan`, whose `= 6` sub-total is the one a reader is most likely to hand-check; the third (`landmark`) is in `#front-a11y`.

**Conforming -- 23 occurrences.**
`ship` at the deliverable altitude: `#swe-branch-lifespan`:7, 19, 20, 26, 33 (×2) = 6; `#git-branch-workflow`:14; `#ai-plan`:7, 14 = 2; `#swe-agile`:4; `#swe-consolidation-audit`:21; `#swe-done`:28; `#swe-public-surface-docs`:3; `#swe-security`:10; `#ai-tool-safety`:3.
`land` at the unit-of-work altitude: `#ai-done`:6; `#ai-multiple-requests`:3, 10 (×2), 11 = 4; `#swe-done`:4, 8 = 2; `main.md`:13.

**Violating -- 4 occurrences.**
Three use `ships` for "lands in the diff" and then constrain the follow-up to the same PR, impossible once the branch has merged; one uses `land` for the merge itself:

| site | text | why broken |
| --- | --- | --- |
| `#swe-reference-spec`:10 | "after a change **ships**, ... any drift fixed **in the same PR**" | can't fix in the PR after merge |
| `#swe-test-quality`:7 | "When a schema or entity-model change **ships**, update the affected fixtures **in the same change**" | same |
| `#swe-technical-debts`:5 | "when remediation **ships**, delete the file **in the same change**" | same |
| `#git-branch-workflow`:8 | "Changes **land** on `` `main` `` via squash-merge" | `land` used for the deliverable altitude |

**Locally defined, kept -- 4 occurrences over 3 lines.**
`#be-api-versioning`:3, :4, :9 (×2) uses `shipped` in a *release* sense ("shipped to a consumer"), and line 9 defines that sense explicitly, letting a project override it in its reference spec.
A term that names its own definition site is not drift.

**Plain English, out of scope -- 2 occurrences.**
`#ui-perceived-performance`:5 ("until the result lands") and `#ui-tabs`:6 ("whether their click landed"), under `main.md`'s existing carve-out: the vocabulary names the process, not a project's domain.

`#swe-public-surface-docs`:3 is classified **conforming**, not violating: it parses correctly -- at merge the surface is documented, and the doc landed in the same change.

### D3. `subagent` vs `sub-agent`

Pattern: the literal `sub-agent`.
Five occurrences over four lines inside `instructions/` (`#ai-review-engine`:3, 7, 15; `#ai-spec-review`:7 ×2), against twelve `subagent`; the tag itself is `#ai-subagent-dispatch`.

The same spelling survives in prose describing the same protocol **outside** `instructions/` -- 15 occurrences over 13 lines:

| file | occurrences | lines |
| --- | --- | --- |
| `README.md` | 1 | 53 |
| `tools/claude/skills/code-review-board/SKILL.md` | 4 | 18, 21, 47, 106 |
| `tools/claude/skills/spec-review-board/SKILL.md` | 7 | 22 (×3), 23, 24, 26, 27 |
| `devtools/claude/skills/instruction-review-board/SKILL.md` | 2 | 49, 140 |
| `docs/future-work/2026-06-24-spec-review-learned-routing.md` | 1 | 9 |

The first three ship to consumers, and `#swe-docs-drift` puts the top-level `README` always in scope.

### D4. Actor noun: `AI assistant` vs `AI agent`

`AI assistant` in `main.md`:3 and `#git-branch-workflow`:15, 20; `AI agent` in `#ai-done`, `#swe-done`, `#git-merge-conflict`, `#swe-prompt-injection-sentinel`.
The short form `the agent` is used freely after either and is not being changed.

### D5. `logical units`

`#git-branch-workflow` line 24 -- "as many as the logical units demand" -- survives from the wording that predates the `main.md` vocabulary and now names nothing the set defines.

### D6. `standard` -- inventoried, no defect

`#ai-session-hygiene` uses `standard` (×3) for a persisted work convention.
Nothing else in the set uses the noun that way, and nothing collides: the other occurrences (`standard library`, `standard harness`) are adjectival.
Renaming to `convention` was considered and rejected -- `convention` is already precise in `#swe-naming` (the form a name takes), `#ai-conversational`, and `#be-api-versioning`, so the rename would import a third sense into a word that has one clean one.

### D7. `change` used as the done-gate subject

`change` has two senses. The split needs an operational test, because applied loosely it catches sites that are correct as they stand:

> An occurrence is **gate sense** when `change` is the subject of a completion obligation that cites `#swe-done`, or sits inside a `#swe-done` tier whose stated subject is the unit.
> It is **diff sense** when it names the edit itself -- canonically "in the same change" -- or when the rule **defines the term locally**.

Applying the test needs a bounded candidate set, not a read-through of every `change` in the set.
A single grep for the tag does **not** bound it: `#swe-done` reaches gate-sense sites three ways, and only the first is a literal citation.
The candidate set is therefore the union of three parts -- **16 lines**, each carrying a verdict below.
The pattern throughout is the **noun** `\bchanges?\b` (case-insensitive); `changed` is always a verb here and is excluded by design.

| part | how reached | lines |
| --- | --- | --- |
| **(a)** rules that cite the tag | literal citation | **6** |
| **(b)** `#swe-done`'s own occurrences | inside the rule itself, which cites its tag only in its H1 and so is invisible to (a) | **4** |
| **(c)** rules `#swe-done`:16 names for a per-unit obligation | inbound reference | **6** (`#swe-docs-drift`:3, 5, 8, 9; `#swe-entity`:8, 9 -- `#swe-reference-spec` and `#swe-design-decisions` are already in (a)) |

`#swe-done`:16 is the inbound-reference source for part (c) but is **not itself a candidate**: its two occurrences are `changed`, the verb.

| site | part | verdict |
| --- | --- | --- |
| `#swe-testing`:7 -- "A **change** is not done until its tests pass locally (#swe-done)" | a | gate -> rename to `unit of work` |
| `#swe-reference-spec`:10 -- "after a **change** ships ... gated by #swe-done" | a | gate -> rename to `unit of work` |
| `#swe-design-decisions`:9 -- "gated by #swe-done, ... when a **change** alters its rationale" | a | gate -> rename to `unit of work` |
| `#git-pr-body`:7 -- "the explicit statement #swe-done requires of an untestable **change**" | a | gate -> rename to `unit of work`, following `#swe-done`:13 which it quotes |
| `#be-api-versioning`:4 -- "may **change** freely" | a | verb, not the noun; keep |
| `#ai-plan`:13 -- "present-truth docs must **change**" | a | verb, not the noun; keep |
| `#swe-done`:13 -- "or the **change** is genuinely untestable", inside per-unit item 2 whose subject is "the unit" | b | gate -> rename to "the unit" |
| `#swe-done`:4 -- "a trivial **change** that skipped the spec" | b | keep: this *defines* a unit of work, so renaming it is circular |
| `#swe-done`:28, 29 -- "the change does not ship", "the change is meant to produce" | b | diff sense (the artifacts of the edit); keep |
| `#swe-docs-drift`:3, 5, 8, 9 | c | **locally defined** -- line 5 states *"'The change' includes direct code edits, dependency version bumps..."*; keep, and add one pointer that `#swe-done`:16 restates the same obligation per unit |
| `#swe-entity`:8, 9 -- "Every **change** to the entity schema **MUST** be preceded by ... an updated entity model" | c | diff sense: an ordering rule on the edit, not a completion gate; keep |

`#swe-test-quality`:5 was cited in an earlier draft of this section and is **withdrawn**: the line contains no `change` token at all ("a test that flakes counts as failing (#swe-done)"), so there is nothing to rename.

## Goal

Every altitude is named by exactly one noun, every verb in contention names exactly one altitude, and no rule referent is a literal that only holds for this repo.

The verb half is deliberately narrower than the noun half: `plan step` gets no verb, because none is contested (Design A).

## Conformance

- **Reference spec** -- `docs/reference-spec/documentation-model.md` is unaffected (it describes the records architecture, not the process vocabulary). `docs/reference-spec/entity-model.md`:84 **is** affected in principle and is carved out with a reason in Design B; the carve-out is recorded rather than assumed.
- **Design decisions** -- unaffected; no existing decision's rationale changes.
- **`#swe-terminology`** -- deliberately **not** the home for this vocabulary. That rule governs the software a project writes; this is the instruction set's own process vocabulary, so it lives in `instructions/main.md` beside the noun table. Same reasoning the noun table already carries.
- **`#ai-plan` (append-only)** -- frozen working specs under `docs/working-specs/` are point-in-time and keep the old vocabulary. Out of scope.
- **Consumers** -- no `#tag` is renamed, so nothing breaks. A consumer picks the new vocabulary up on its next `agentsmith` run; a stale project instruction file or agent memory keeps an old noun until regenerated, already recorded as a constraint in the future-work file.
- **Divergence:** none.

## Design

### A. Verb table in `main.md`

The existing noun table gains a verb table beneath it, in the **same shape** (term, then gloss), covering the two verbs actually in contention:

| term | what it names |
| --- | --- |
| `ship` | a branch squash-merges to the default branch -- the `deliverable` is delivered |
| `land` | a `unit of work` completes on the branch |

Followed by one line: no verb is fixed for the `plan step` altitude, because none is in contention.

Deliberately **no `commit` row**.
`main.md`:14 already glosses a plan step as "a step, a workstream, **a commit**", so a row asserting a commit is something other than a plan step would contradict the noun table two lines above it.
`commit` is left exactly as the noun table has it.

### B. `the default branch` is the referent; `` `main` `` is an example

`the default branch` replaces `` `main` `` at every rule-referent site, spelled out per line so the edit is prose, not a token swap:

| site | before | after |
| --- | --- | --- |
| `#git-branch-workflow`:5 | "All work happens on branches off `` `main` ``." | "All work happens on branches off the default branch (`` `main` `` in most repos)." **-- the one gloss** |
| `#git-branch-workflow`:6 | "branches from an up-to-date `` `main` `` (fetch first)" | "branches from an up-to-date default branch (fetch first)" |
| `#git-branch-workflow`:7 | "while the session is on a non-`` `main` `` branch" | "while the session is on a branch other than the default branch" |
| `#git-branch-workflow`:8 | "Changes land on `` `main` `` via squash-merge." | "A branch ships to the default branch via squash-merge (#swe-branch-lifespan decides *when*)." |
| `#git-branch-workflow`:9 | "**Never** commit directly to `` `main` `` or the default branch" | "**Never** commit directly to the default branch" |
| `#git-branch-workflow`:16 | "the only commit that survives on `` `main` ``" | "the only commit that survives on the default branch" |
| `#swe-done`:26 | "before it squash-merges to `` `main` ``" | "before it squash-merges to the default branch" |
| `#be-api-versioning`:9 | "treat \"shipped\" as merged to `` `main` ``" | "treat \"shipped\" as merged to the default branch" |

Line 8's cross-reference resolves its overlap with line 14 ("the branch ships once it stops converging"): line 8 states the mechanism, line 14 the trigger, and each now points at the other's role.

Verified over the repo root: `README.md`, `CONTRIBUTING.md`, and the root `AGENTS.md` contain **no** branch-referent `` `main` `` at all (`CONTRIBUTING.md`'s only hit is the filename `main.md`), so no carve-out is needed for them.
A consumer's root `AGENTS.md` is generated and inherits the change.

**Carve-out -- the `targetRef` schema enum.**
`docs/reference-spec/entity-model.md`:84 declares `targetRef: 'main' | 'feature-branch'`, duplicated at `tools/claude/skills/code-review-board/issue-format.md`:50-51 and glossed in prose at `tools/claude/skills/code-review-board/SKILL.md`:33, 36, 38, 43.
This is the same literal-for-concept conflation D1 fixes, and it is **left alone here on purpose**: `'main'` is a persisted enum *value*, not rule prose, carried in existing per-machine round stores under `.agentsmith/review-board/`.
Renaming it is an entity-model change plus a data migration (`#swe-entity` orders the model first), which is a different unit of work from a prose rename.
The prose sites in `SKILL.md` gloss the enum value and must keep naming the literal while the value exists.

The migration is **not** a schema-validation change: no script under `tools/claude/skills/code-review-board/` reads `targetRef` at all -- `lint.mjs` checks only `baselineCommit`, and `persist.mjs` writes through whatever the round object carries.
The single consumer is `SKILL.md`'s Setup prose (lines 33-43), which chains rounds by scanning persisted `rounds/*.json` for the `'main'` value.
So the work is a value backfill over existing `rounds/*.json`, or a dual-literal lookup in Setup -- recorded that way in the trimmed future-work file (Design D, residue 3) so whoever picks it up neither over- nor under-scopes it.

### C. Edits

Counts are occurrences.

| file | change |
| --- | --- |
| `main.md` | add the verb table + the plan-step line (Design A); `AI assistants` -> `AI agents` (×1) |
| `#git-branch-workflow` | the six line rewrites in Design B; line 24 "as many as the **logical units** demand" -> "as many as **the work demands**" (D5 -- stated literally, because a bare token swap yields the ungrammatical "the work demand"); `AI assistant` -> `AI agent` (×2, lines 15 and 20) |
| `#swe-done` | `` `main` `` -> the default branch (×1, line 26); gate subject `change` -> `the unit` (×1, line 13) |
| `#be-api-versioning` | `` `main` `` -> the default branch (×1, line 9); the `shipped` sense stays, per D2 |
| `#swe-reference-spec` | `ships` -> `lands` (×1); gate subject `change` -> `unit of work` (×1) -- both line 10 |
| `#swe-test-quality` | `ships` -> `lands` (×1, line 7). **No** `change` edit -- see D7 |
| `#swe-technical-debts` | `ships` -> `lands` (×1, line 5) |
| `#swe-testing` | gate subject `change` -> `unit of work` (×1, line 7) |
| `#swe-design-decisions` | gate subject `change` -> `unit of work` (×1, line 9) |
| `#swe-docs-drift` | no rename. **Append** as the final line of the rule (so no line number D7 cites shifts): "`#swe-done` item 3 restates this obligation per unit of work, so drift is resolved per unit rather than only at the PR." **This sentence is load-bearing for two counts and must carry neither token**: no `change`/`changes` (which pins criterion 6b part (c) at 6, not 7) and no `ship`/`land` word (which pins criterion 5 at 35, not 36). Re-check both if the wording is ever altered |
| `#git-pr-body` | gate subject `change` -> `unit of work` (×1, line 7) |
| `#ai-review-engine` | `sub-agent` -> `subagent` (×3) |
| `#ai-spec-review` | `sub-agent` -> `subagent` (×2, both on line 7) |
| `README.md` | `sub-agent` -> `subagent` (×1) |
| `tools/claude/skills/code-review-board/SKILL.md` | `sub-agent` -> `subagent` (×4) |
| `tools/claude/skills/spec-review-board/SKILL.md` | `sub-agent` -> `subagent` (×7, three on line 22) |
| `devtools/claude/skills/instruction-review-board/SKILL.md` | `sub-agent` -> `subagent` (×2) |
| `docs/future-work/2026-06-24-spec-review-learned-routing.md` | `sub-agent` -> `subagent` (×1) |

### D. The future-work file is trimmed, not deleted

`docs/future-work/2026-07-22-instruction-set-terminology-audit.md` is rewritten section by section, not deleted:

| section | disposition |
| --- | --- |
| title + `Date:` / `Status:` / `Context:` block | kept; `Context:` updated to name this spec as the discharging work |
| `## The gap` | replaced -- it narrates the pre-audit state, which this spec supersedes. New text: which clusters were audited and settled here, and which residue remains |
| `## The deferred work` | trimmed to the three residues below |
| `## Constraints` | the file has **two** bullets, and the global scope clause is the trailing half of the second, not a line of its own. Bullet 1 (a rename ships to every consumer; a stale project file or memory keeps the old noun) kept verbatim. Bullet 2 is **truncated at its semicolon** to "Frozen working specs (`#ai-plan`) are point-in-time and stay on the old vocabulary." -- dropping "; only present-truth docs and `instructions/` are in scope", because each of the three residues below now carries its own scope, two of which are wider than that clause allowed |

The three residues:

1. **The diff-sense `change` / `diff` / `commit` cluster**, scope `instructions/`. D7 settles only the gate sense.
2. **No vocabulary-regression lint**, scope `instructions/ README.md tools/ devtools/ docs/future-work/` -- the scope this spec proved is real, per D3 and success criterion 2.
3. **The `targetRef: 'main'` schema enum**, scope `docs/reference-spec/entity-model.md`, `tools/claude/skills/code-review-board/` -- per the Design B carve-out. Blocked on an entity-model change plus a **value backfill over existing `rounds/*.json`, or a dual-literal lookup in `SKILL.md` Setup's round-chaining** -- not a lint or persist change, since no script reads the field.

The existing global scope clause ("only present-truth docs and `instructions/` are in scope") is **dropped rather than narrowed**, and scope moves onto each residue: residues 2 and 3 are *wider* than that clause allowed, reaching shipped adapter files under `tools/` and `devtools/` that are neither present-truth docs nor `instructions/`.
Narrowing it would re-bake the blind spot D3 exposed.

## Non-goals

- **Not** renaming `standard` (D6).
- **Not** a vocabulary-regression lint. `test/instruction-integrity.test.mjs` checks dangling `#tag`s and ownership coverage only; nothing stops a later contributor reintroducing `` `main` ``, `sub-agent`, or `AI assistant`. Deferred to the trimmed future-work file (residue 2) rather than scoped here -- a prose-vocabulary linter is its own design problem, and shipping one on the back of a rename would bundle two unrelated units of work.
- **Not** renaming the `targetRef` schema enum (Design B carve-out, residue 3).
- **Not** touching frozen working specs.
- **Not** revisiting the noun table -- `deliverable` / `unit of work` / `plan step` stand as landed, and Design A is constrained by `main.md`:14's existing gloss rather than changing it.
- **Not** auditing the diff-sense `change` / `diff` / `commit` cluster (residue 1).

## Success criteria

Every criterion is a command or a named enumeration. Commands use `grep`; `rg` is not on PATH in this environment.

1. ``grep -rn '`main`' instructions/`` returns exactly one line: the Design B gloss in `#git-branch-workflow`:5. (The quoted form, not `\bmain\b`, which matches `main thread` and `main-content` -- see D1.)
2. ``grep -rn 'sub-agent' instructions/ README.md tools/ devtools/ docs/future-work/`` returns nothing.
3. ``grep -rn 'AI assistant' instructions/`` returns nothing.
4. ``grep -rn 'logical units' instructions/`` returns nothing.
5. **D2 enumeration is the checklist.** Re-running the D2 pattern over `instructions/` yields **35** occurrences: the 33 inventoried in D2, plus the two `term` cells (`` `ship` ``, `` `land` ``) that Design A's verb table adds to `main.md`. Every other edit is net-zero for the count -- Design B's line-8 rewrite trades a `land` for a `ships`; the three `ships` -> `lands` edits keep their match; the five D7 renames touch no `ship`/`land` token; and the `#swe-docs-drift` pointer sentence is worded to carry none (Design C). Any occurrence outside those 35 means the inventory is stale and the criterion fails.
6. **D7 candidate set is the checklist**, checked in its three parts because no single grep bounds it. `-w` supplies the word boundary; `grep -E '\b...'` is not supported by every `grep` on PATH here. The three commands are:
   - part (a) -- ``grep -rniw -e change -e changes instructions/ | grep '#swe-done' | grep -v '/swe-done.md:'``
   - part (b) -- ``grep -niw -e change -e changes instructions/core/swe/swe-done.md``
   - part (c) -- ``grep -rniw -e change -e changes instructions/core/swe/swe-docs-drift.md instructions/core/swe/swe-entity.md``

   **6a. Inventory check -- run against the corpus as it stands, *before* applying Design C.** The three return **6 / 4 / 6**, and all 16 lines carry a verdict row in D7. A seventeenth line, or a line absent from the table, means the inventory is stale and Design C must be re-derived before it is applied.

   **6b. Done-gate -- run *after* applying Design C.** The same three return **2 / 3 / 6**: the four part-(a) renames (`#swe-testing`:7, `#swe-reference-spec`:10, `#swe-design-decisions`:9, `#git-pr-body`:7) each remove the line's only `change` token, leaving the two verb-sense keeps; `#swe-done`:13's rename to "the unit" removes one of part (b)'s four; part (c) is unchanged because no row there is renamed and the appended `#swe-docs-drift` pointer carries no `change` token (Design C).
7. **The D7 renames landed** -- a positive check, since 6b alone is satisfied by deleting text: ``grep -riw 'unit of work' instructions/core/swe/swe-testing.md instructions/core/swe/swe-reference-spec.md instructions/core/swe/swe-design-decisions.md instructions/core/git/git-pr-body.md`` returns at least one line per file, and ``grep -n 'the unit is genuinely untestable' instructions/core/swe/swe-done.md`` returns line 13.
8. `npm test` passes. It does **not** verify the prose vocabulary -- only that these edits break no dangling `#tag` or ownership-coverage lint in `test/instruction-integrity.test.mjs`. See Non-goals.
9. `npm run build -- --stdout` still forges, and `npm run check:index` passes.
10. `docs/future-work/2026-07-22-instruction-set-terminology-audit.md` exists and contains exactly the three residues in Design D, with the replaced scope line.
