# Ephemeral working specs

Status: Approved

## Problem

A working spec is committed under `docs/working-specs/<date>-<slug>/` and frozen once `Approved`.
It is explicitly **not** present-truth -- `#swe-reference-spec` forbids consulting it for current truth -- so the corpus accretes without ever being read.
The cost is real and compounding: a growing dated corpus, a generated `INDEX.md`, a CLI subcommand and drift test to maintain it, and a `#swe-done` gate that fails when the index is stale.

The retrieval failure is a property of the *storage form*, not of the content.
A frozen, dated record with no supersession annotation and no backlink from code can only be read by traversing the chain and inferring the current position.
The cure is not a better chain: it is to route each kind of rationale to a form that is already self-replacing, already at the site it constrains, or deliberately not kept.

## Definitions

This spec defines no vocabulary of its own: `instructions/main.md`:20-21 already fixes the two verbs, and they are used here strictly.

- **ship** -- a branch squash-merges to the default branch (also `#swe-branch-lifespan`:7).
- **land** -- a unit of work completes on the branch.

The two are **not** the same event: a branch may carry several units (`#swe-branch-lifespan`:16, and this spec's own Store and Supersession sections), and one squash-merge ships a deliverable in which several units landed.
An earlier draft of this spec conflated them, so every mechanism below is stated against its own event:

| mechanism | fires on |
| --- | --- |
| a unit **lands** -- done at the `#swe-done` per-unit gate | its working spec reaching `Implemented` |
| a working-spec directory is deleted -- current or superseded | the branch **ships**; `.agentsmith/specs/<branch>/` is removed, one delete covering every unit on it |
| an epic unit's delivery state reaches `shipped` | the ship of the branch on which that unit landed; when a branch carries several landed units, all reach `shipped` on that one ship |

Deletion is keyed to **ship, never land**. On a multi-unit branch a per-unit trigger would delete an earlier unit's directory mid-branch and destroy the retained revisit counter the Supersession section depends on.

`docs/design-decisions/epic-planning-tier.md`:5 states the default mapping of one unit of work to one squash-merge, while `#swe-branch-lifespan` permits a branch to bundle.
This spec changes neither; it only stops asserting the two events are the same.

## Decision

The working spec becomes **branch scratch**: uncommitted, mutable, deleted when the branch ships.
`docs/working-specs/` and its tooling are removed.
The unit's durable trace is the PR body; its standing rationale is the design-decisions log; its site-specific constraints are comments at those sites.

### Rationale routing

| rationale | home | governed by |
| --- | --- | --- |
| non-obvious constraint at a specific code site | comment at that site, naming the decision slug where one exists | `#code-style`, `#swe-design-decisions` |
| binds other work, or would be re-litigated | `docs/design-decisions/<slug>.md` (mutable, self-replacing) | `#swe-design-decisions` |
| deliberation about a shipped choice | PR body only -- not kept as a repo record | `#git-pr-body` |

Deliberation gets no durable **in-repo** home by construction, not by neglect.
It is definitionally point-in-time, so any committed form inherits the accretion and chain-reading pathology this change removes; and stale deliberation actively misleads a future contributor re-opening the question, because the constraints that decided it may no longer hold.
The PR body is the correct channel precisely because it is *off* the development read path: it is reached by `git blame` -> commit -> PR, which is the access pattern for "what was considered when this was written", and it costs nothing to maintain.
That places the deliberation record in the forge rather than the repository, so it is host-dependent and unavailable offline.
Accepted without mitigation: the same reasoning that says deliberation need not be kept says it need not be kept locally.

### Store

`.agentsmith/specs/<branch>/<YYYY-MM-DD>-<slug>/` at the repository root, gitignored and per-machine, holding `spec.md` and/or `plan.md`.

- **The `<branch>` component is load-bearing, not decoration.** The store is untracked, so it does not change on `git switch`, and deletion is triggered by a merge the human performs on the forge -- directories from an earlier or abandoned branch persist. Without a branch key they share one flat namespace, the date prefix orders them but does not attribute them, and the revisit count the Supersession stop-signal reads is not derivable (two branches in one week is enough to break it). The key also reduces the merge sweep to a single directory delete.
  The branch name is used as-is; a `/` in it nests naturally as a subdirectory.
  **Accepted residuals**, all one root cause -- a branch name is a currently-in-use label, not an append-only identifier: a directory whose branch was abandoned without a merge persists; `git branch -m` renames the ref without moving the directory, so the sweep misses the pre-rename directory and a fresh one restarts the revisit count at zero; and a deleted branch name reused later inherits the old directory, so an unrelated branch can read a stranger's count.
  All three are tolerated on the same grounds as an orphaned directory -- the store is gitignored scratch and the count feeds a judgement prompt, not a gate. Keying on something append-only (the branch's first commit SHA, recorded at creation) would fix it and is deliberately not done: it trades a legible path for precision the signal does not need.
- Repository level, not user level: a working spec is branch-scoped, so it belongs beside the branch; a user-level store would have to encode repo and branch itself.
  Consistent with `.agentsmith/review-board/` and `.agentsmith/tmp/`; `.gitignore` already excludes `.agentsmith/` wholesale, so no new ignore rule is needed and an approved spec cannot be committed by accident.
- Not under `.agentsmith/tmp/`: `tmp` is where the set parks per-run reasoning that is safe to delete at any time, and a working spec's vulnerable window is the implementation window, before the PR body exists.
  `#ai-multiple-requests` keeps request tracking at `.agentsmith/tmp/requests/`; that divergence is deliberate -- a request list is session-scoped and recoverable from the transcript, a spec is branch-scoped and spans sessions.
- The dated `<YYYY-MM-DD>-<slug>` directory name is retained, for ordering when a branch carries more than one spec.

### Mutability

The working spec currently being executed is **mutable in place**.

The `Approved` freeze goes for two independent reasons, and the spec relies on the second:

1. In an untracked store the freeze is not merely unenforced but **unverifiable** -- there is no diff in which a violation could appear, and the party the rule constrains is the party holding the pen.
2. The freeze is wrong on its merits: understanding of the unit improves during implementation, and forbidding the author to say so drives the correction into the reader's head instead of the document.

Reason 2 is what makes removal correct rather than merely convenient.
Unverifiability alone is not the test -- see the slug-comment convention below, which is also unverifiable and is nonetheless kept, because it is beneficial and fails soft.
The test this spec applies is **unverifiable *and* wrong**, not unverifiable alone.

- `Status:` keeps all three tokens: `Draft` / `Approved` / `Implemented`.
  An earlier draft of this spec collapsed it to two on the grounds that `Implemented` would mean "about to be deleted".
  That was wrong, and the Definitions table is why: `#swe-done`:4 defines the **per-unit done gate** as "a working spec reaching `Implemented`", and deletion happens at branch merge, not at unit completion.
  On a branch carrying several units, `Implemented` is the only marker that a unit is finished while the branch is still open -- a distinct, load-bearing state with two live consumers (`#swe-done`:4 and `#swe-branch-lifespan`:8).
  Keeping it also leaves `#swe-reference-spec`:8's lifecycle enumeration intact, so the change is smaller than the earlier draft assumed.
  It does **not** rescue `#ai-plan`:14, which is struck whole -- see the Scope row; that bullet carries "The spec is **never** pruned" in the same breath as the plan-prune permission, and delete-at-ship contradicts it.
- A deviation-worthy revision discovered **after** `Status:` reads `Implemented` -- PR review demanding more work before the branch ships -- reverts it to `Draft` exactly as it would from `Approved`.
  That reversion **un-clears** the per-unit `#swe-done`:4 gate; the gate re-clears only when the revised spec reaches `Implemented` again.
  Re-approval restores `Approved` and nothing more -- it does not re-declare the unit landed, because the redone work has not been executed at that point.
  `Implemented` is not terminal while the branch is open, and `#swe-done`:4's own wording stays untouched, as its Scope row promises.
- The freeze is replaced by the behavioural control that survives: an approved spec may be revised, and a revision that alters **scope, constraints, or interface contract** is a `#ai-plan-deviation` requiring re-approval.
  The threshold's wording is **held by `#ai-plan`** and referenced from `#ai-spec-review`:10, in that direction only -- it currently reads as `#ai-spec-review`'s definition of *substantially revised*, and the two rules must not point at each other.
  `#ai-spec-review`:10 additionally requires that a prior cycle's blocking findings be addressed by such a rewrite before a cycle resets; that condition is its own and stays.
  During a pending re-approval `Status:` reads `Draft` and returns to `Approved` when re-approved: the token states whether the *current text* is approved, not whether some earlier text once was.
- Working-spec `Status:` (maturity of the design text) and an epic unit's delivery state (progress of the work) are deliberately **independent axes**, not a single lifecycle split across two documents.
- When a `#ai-plan-deviation` re-approval changes scope after the PR is open, the PR body is updated at that point -- original scope, the revision, and why -- so the sole durable record does not go stale against what shipped.
  That account is **prose, not a verbatim before/after diff**: no spec text is committed at any point, so nothing exists to check it against.
  Accepted, because the threat model is a single local author keeping their own record rather than an auditor checking an untrusted one -- and because the in-session `#ai-plan-deviation` pause catches the change as it happens, which the committed frozen spec only did after the fact.
- Deletion at the branch ship is stated in `#ai-plan` and is **not** a `#swe-done` gate.
  The store is gitignored and per-machine; an orphaned directory harms nothing, and a merge blocker that fails for no reason is worse than a stale scratch dir.

### Supersession within a branch (scope discovered during authoring)

`#swe-branch-lifespan`:9 states that an earlier working spec is "superseded by a new one, never edited", and its convergence signal counts *revisits of the same abstraction* on the branch.
That count needs an observable artifact, and "never edited" reads as a contradiction of mutable-in-place.

Both hold, because their subjects differ -- :9 governs *an earlier* spec, not the one executing:

- **Revision** of the unit currently being executed edits its spec in place.
- **Revisit** of an abstraction a prior unit on this branch already settled mints a new scratch directory.
- A superseded directory becomes **read-only** at the moment it is superseded.
  Mutable-in-place applies only to the unit currently being executed.
  Without this, an author could edit the superseded directory instead of minting a new one, producing no new artifact, and the revisit count would silently read low -- defeating the third-revisit stop signal `#swe-branch-lifespan` exists to fire.
- The directories under `.agentsmith/specs/<branch>/` are the observable **artifacts**; the count that matters is of those concerning the *same abstraction*, not of directories on the branch.
  `#swe-branch-lifespan`:21 counts revisits of one abstraction, so three units on three unrelated abstractions are three directories and zero revisits -- a bare directory count would fire the third-revisit stop signal on any third unit.
  Which directories concern the same abstraction stays `#swe-branch-lifespan`'s pre-existing judgement call; the store makes the artifacts countable, not the judgement automatic.
- Retention until the branch ships does not conflict with `#swe-branch-lifespan`:22 ("carrying no failed attempt forward as reviewable history"): a retained gitignored directory is a local counter, not reviewable history -- it never reaches a diff, a PR, or the default branch.

Whether two units touch "the same abstraction" remains `#swe-branch-lifespan`'s pre-existing judgement call; this change does not alter it.
`#swe-consolidation-audit` already draws the in-place/chained line for live docs while `#swe-branch-lifespan` has working specs chain, so the distinction is present in the set and only needs stating.

### Epic units of work

`#swe-epic`:36 currently reduces a unit-of-work entry to "a pointer -- the path to that working-spec directory -- which is then the only copy".
Under this change that points into a gitignored path, and it already leaves an in-flight epic with holes in its own roadmap.

- The epic entry is always the durable record of the unit; the working spec is derived scratch and never the copy of record.
  `#swe-epic`:36's pointer clause is struck, not amended.
- The entry carries a **delivery state**: `planned` / `in-progress` / `shipped` with its PR link.
  Deliberately distinct vocabulary from the review board's issue lifecycle (`open`/`promoted`/`fixed`/...) per `#swe-terminology`.
  Transitions are event-triggered, not left to judgement: `in-progress` when the unit is picked up and its scratch directory is created; `shipped` per the Definitions table.
  Delivery state and working-spec `Status:` are independent in value but coupled at these two edges, so both move on the same events rather than drifting apart.
  A branch abandoned without merging leaves its units `in-progress` with nobody working them.
  Since `#swe-epic`:8 requires the epic to hold the *current* plan, the entry reverts to `planned` when the branch is known abandoned -- an explicit correction event rather than accepted staleness, because unlike an orphaned scratch directory a stale roadmap is read.
  (`#swe-epic`:10 covers abandoning the *epic*, not a unit, so it does not reach this.)
- A unit of work is capped at bird's-eye altitude: title, one-paragraph outcome, dependencies, acceptance signal.
  Explicitly **not** file paths, symbol names, schema shapes, or interface contracts -- those are decided when the unit is picked up, and detail written earlier decays for the same reason this whole change exists.
- **Identity.** The unit's `<slug>` is its stable identity and is what dependency declarations (`#swe-epic`:34) reference.
  It is **unique epic-wide**, not per-milestone: dependency edges cross milestone boundaries and resolve by slug alone, so a slug shared by units in two milestones would make an edge ambiguous.
  `#swe-epic`:23 currently carries uniqueness for the old `<id>` only ("epic-local and author-chosen; it need only be unique within the epic") and does not reach `<slug>`; it splits into two sentences, one per identifier, so the guarantee the old id had is not silently dropped by the migration.
  `<milestone-id>-<n>` is a **display and ordering** prefix, derived from current position, so reading an entry locates its milestone without a lookup.
  It is not an identity: re-parenting renumbers the prefix and no dependency edge moves, because no edge is keyed on it.
  A milestone `<id>` therefore carries one format constraint -- no trailing `-<digits>` -- so that `<milestone-id>-<n>` splits unambiguously and a milestone `release-1` cannot produce a unit token indistinguishable from a milestone `release-1-2`.
  The two namespaces need **not** be jointly disjoint: dependency declarations (`#swe-epic`:34) are same-tier reference lists, each keyed on its own entity's identifier (milestone `<id>` -> milestone `<id>`, unit `<slug>` -> unit `<slug>`), so a milestone `<id>` string equal to some unit `<slug>` string is never resolved as one token.
  Splitting the old single `<id>` namespace into two per-entity fields is therefore safe; had cross-tier edges been intended, disjointness would be required and `#swe-epic`:34 would need editing, which it does not.
  `-` as separator, not `#`: `#ai-review-board` already claims `<roundId>#<role>-<n>` for a different composition.
- `units-of-work/<id>-<slug>.md` collapses into the owning `milestones/<id>-<slug>.md` file: at this altitude a unit is a section, not a file.

### Design-decision consequences

`#swe-design-decisions` loses a leg it asserts by name.
Three deletions and one addition:

1. "Past rationale is preserved by the frozen working spec that introduced the change (#ai-plan) and by git" -> git and the PR body.
2. The reach test goes single-tier: "a choice local to one unit stays in that unit's working spec" is struck.
   That clause was a wastebasket dressed as a filing instruction -- a rejection from the decision log, not a home.
   Unit-local rationale routes per the table above.
3. "Present-truth documents **and working specs** link out to a decision by slug" -> present-truth documents only.
   No backlinks and no intermediate index: one-way linking is a deliberate anti-staleness choice, and under this change the referrers are ephemeral, so a reverse index would rot faster than the form it replaced.
4. **Addition** -- where a decision constrains a specific code site, the comment at that site names the decision slug.
   Before writing a bare constraint comment, grep `docs/design-decisions/` for the constraint's subject, so the convention is recognition rather than recall.
   This **narrows** the discoverability gap; it does not close it.
   `#swe-design-decisions` tells a reader to grep a slug to find what it affects, but nothing puts the slug in the code, and this convention is unverifiable and depends on author diligence -- kept because it is beneficial and fails soft (an omitted slug loses a backlink; nothing breaks).
   A slug comment is in scope for `#swe-docs-drift` when a decision file is deleted or renamed: grep the slug and update or remove the comments.

`#code-style` opens with "No gratuitous comments", which reads as a block on item 4.
It gains an explicit carve-out: a non-obvious constraint at a site, or a decision-slug pointer, is not a gratuitous comment.

## Scope

Every line number below is a **pre-edit anchor for locating a clause**, never an instruction to edit that line.
Several files take multiple edits in one pass, so earlier edits shift later anchors: locate by the quoted text, not by the number.

### Instruction rules (`instructions/`)

Named clauses are the ones verified to assert the old model; the sweep below is the backstop, not the list.

| rule | change |
| --- | --- |
| `#ai-plan` **strikes** | **:9 -- "append-only once `Approved` -- its body is frozen" is struck.** The single most load-bearing edit of the change, named here rather than left implied by the word "mutability". Plus: :3 states the `.agentsmith/specs/<branch>/<YYYY-MM-DD>-<slug>/` path directly and drops the `(#swe-docs-layout)` cross-reference, since that table documents `docs/` and the store is no longer under it; strike the `INDEX.md` clause (:15-17); **strike :14 whole** -- one bullet carrying both the plan-prune permission and "The spec is **never** pruned"; reframe the branch clause (:6) onto the unit of work rather than the directory |
| `#ai-plan` **additions** | Four clauses, listed under this table -- a markdown cell cannot carry a list, and each is a separate rule |
| `#swe-reference-spec` | :6's "those are immutable point-in-time history" is falsified by mutability. :8's `Draft`/`Approved`/`Implemented` enumeration **stands** (the token is kept) and :7's never-consulted-for-current-truth position stands and is reinforced |
| `#swe-branch-lifespan` | reconcile revision vs revisit; superseded dirs read-only; retention vs :22 stated. :8's `Implemented` reference **stands** -- no edit |
| `#swe-design-decisions` | three deletions, one addition (code-site slug pointer, with the drift-sweep clause). Plus :5's **opening** contrast -- "unlike working specs (#ai-plan), a decision file is **mutable and self-replacing**" -- which is falsified now that a working spec is also mutable; restate it against the *ephemeral* working spec (a decision file is kept and self-replacing; a working spec is deleted at ship). Distinct from deletion 1, which reaches only the trailing "Past rationale is preserved by the frozen working spec" sentence on the same line |
| `#code-style` | comment carve-out for site constraints and decision-slug pointers |
| `#git-pr-body` | item 2 states approved scope and acceptance signal inline (a gitignored path is not a link), and is updated on a post-PR-open re-approval |
| `#swe-done` | **per-branch item 3** (not item 2) drops the working-specs index and `agentsmith spec-index --check` (:25). The per-unit gate at :4 -- "a working spec reaching `Implemented`" -- **stands**, which is why the token is kept. Plus one clause on **per-branch item 5** (:28-30): its temporary-artifact sweep, which fires *before the PR*, does **not** reach `.agentsmith/specs/` -- that is a durable store with its own stated deletion trigger (`#ai-plan`, at ship), the same standing `.agentsmith/review-board/` has under `#ai-review-board`:16. Item 5's "durable stores a workflow writes by design" carve-out would arguably cover it, but inference is exactly what fails here: unstated, the set's own pre-PR checklist tells an agent to delete what another of its rules says to keep until ship, inside the window the Store section calls the spec's most vulnerable |
| `#swe-docs-layout` | remove the `docs/working-specs/` row (:7) |
| `#swe-epic` | strike :36's pointer / "only copy" clause; :7's contrast -- "unlike a working spec (#ai-plan), an epic is **mutable and self-replacing**" -- restated against the ephemeral working spec, the same treatment `#swe-design-decisions`:5 gets; delivery state with its transition triggers; bird's-eye cap; split :23's uniqueness sentence into milestone-`<id>` and unit-`<slug>` halves and add the milestone-`<id>` format constraint; `units-of-work/` collapse |
| `#ai-spec-review` | scratch path (:3 `docs/working-specs/`). **:14 is partitioned, not struck** -- it is one bullet carrying two claims, and only the first is falsified. The first clause ("Only the final spec is committed") is replaced: no working spec is committed at all, the spec itself being gitignored scratch. The second clause ("per-round reviews and rebuttals are ephemeral under `.agentsmith/tmp/spec-review/<spec-dir-name>/` and never committed") **stands** -- it is the set's only statement of the review-scratch rule, and nothing else carries it (`#ai-review-engine` has no equivalent), so striking the line whole would delete the rule keeping this very review's artifacts out of the repo. **Threshold ownership, one direction only:** `#ai-plan` holds the *alters scope, constraints, or interface contract* wording and `#ai-spec-review`:10 references it -- not the reverse, and not both. :10 **keeps its own additional condition** (that one or more blocking findings from the prior cycle are addressed by such a rewrite): that condition is what makes a cycle reset, which `guard.mjs` implements, so a careless "share" that drops it would silently change convergence semantics -- a reach this change does not take |

**`#ai-plan` gains four clauses.**
Striking :9 removes a control, so the rule must gain the ones that replace it.
None exists anywhere in the rule sources today -- `#ai-plan-deviation` carries neither the threshold nor any statement about a working spec's mutability:

1. **Mutable in place**, scoped to the unit currently being executed, with superseded directories read-only (see the `#swe-branch-lifespan` row).
2. **A revision altering scope, constraints, or interface contract is a `#ai-plan-deviation` requiring re-approval.** `#ai-plan` is the rule that **holds** this wording.
3. **The two `Status:` transitions:** `Draft` while a re-approval is pending, and `Implemented` -> `Draft` on a deviation-worthy revision, with the per-unit gate un-cleared until `Implemented` is reached again.
4. **The delete-at-ship rule** replacing :14, covering spec and plan alike -- the sweep removes both at ship, and deleting a plan earlier is permitted and ungated, since nothing reads it.

No `#tag` is added or removed, so `instructions/ownership.yaml` is unchanged.

Two sweeps back this table up, because it is not trusted to be exhaustive.

1. **Removed vocabulary**, mechanical -- every hit goes: `git grep -n -e "working-specs" -e "spec-index" -- instructions`.
   The pattern is the **bare** token, not `docs/working-specs`: `#ai-plan`:3 says "one directory under working-specs", with no `docs/` prefix, so the prefixed pattern misses the row's most-cited clause.
2. **Immutability vocabulary**, a judgement sweep -- each hit is disposed of, not deleted wholesale: `git grep -n -e mutable -e self-replacing -e immutable -e frozen -e point-in-time -e committed -- instructions`.
   An earlier draft declined this sweep on the grounds that `frozen` and `immutable` "remain correct", which was the reasoning that let two live clauses through: `#swe-epic`:7 and `#swe-design-decisions`:5 both define themselves *by contrast with* an immutable working spec, and both are now named above.
   Three rules draw that identical contrast (`#swe-reference-spec`:6 is the third), so a sweep that finds none of them is the wrong sweep.
   `committed` is in the pattern set because `#ai-spec-review`:14 -- a clause this change strikes -- is otherwise invisible to it.
   Hits that stay: prose describing a superseded directory as read-only; the point-in-time family that survives (`docs/future-work/`, `docs/technical-debts/`); `#swe-epic`:9's "topic-scoped, not point-in-time" (its own claim is unaffected -- only the family it contrasts against loses a member); `#ai-spec-review`:14's **second** clause (see its row -- the line is partitioned, not struck); and the unrelated `committed` uses in `#ai-review-board`, `#swe-environment`, `#ai-multiple-requests`, `#ai-done`, `#ai-session-hygiene`, `#swe-entity`, `#swe-design-decisions`:6, and `#ai-instruction-review`:8-9 (the last inside `instructions/authoring/`, which the sweep reaches).

### Tooling removed (breaking)

`agentsmith spec-index` is public surface; removing it deletes its docs in the same change (`#swe-public-surface-docs`).

- delete `bin/spec-index.js`, `src/specindex.js`, `test/spec-index.test.mjs`, `tools/claude/commands/spec-index.md`
- `bin/cli.js`: remove the `spec-index` verb at **four** sites -- the `runSpecIndex` import (:9), the comment (:27-29), the dispatch block (:30-52), and the `HELP` synopsis line (:59).
  The import is the sharp one: `src/specindex.js` is deleted by this same change, so a surviving import makes every `node bin/cli.js` invocation throw `ERR_MODULE_NOT_FOUND`. Verification row 2 fails hard on it and row 5's `-e "specindex"` reaches it, so it cannot ship silently -- but it is the site an implementer working from anchors alone would miss.
- `package.json`: remove `build:index` and `check:index`
- `test/tools.test.js`:72-85 -- **not** an assertion deletion.
  `tools/claude/commands/spec-index.md` is that test's only *positive* inclusion case (:82 asserts `.claude/commands/agentsmith-spec-index.md` IS in the install plan, against the excluded lifecycle commands).
  Swap the fixture to another real non-lifecycle command (e.g. `tools/claude/commands/spec-review-board.md`, verified present) and keep both halves of the assertion.
- `test/cli.test.js`:380-386 -- the case exercises only the removed verb, with no other assertion inside it; delete the case.
- **No plugin-manifest regeneration is required.** `bin/build-plugin.js` is pure-templated from `package.json` and the manifests deliberately omit `commands` (auto-discovered), so deleting a command file changes neither generator input nor output.

### Docs

Sweep run against the **pre-edit** tree. Both the corpus *and* the pattern set are stated, because an earlier draft of this spec swept only the path patterns and therefore missed every reference naming the command alone:

```sh
git grep -n -e "docs/working-specs" -e "working-spec" -e "spec-index" -e "specindex" \
  -e "build:index" -e "check:index" -- . ":(exclude)docs/working-specs"
```

Rewritten in place, with the falsified assertions named:

- `docs/reference-spec/documentation-model.md` -- remove both working-spec rows (:10-11) and the `INDEX.md` + `agentsmith spec-index` line (:20-21).
  Four further edits, each already decided elsewhere in this spec: Boundary 1 (:28) loses "and specs" from the link-out clause (per Design-decision consequences item 3); Boundary 2 (:30-34) loses the reach-test clause "a choice local to one unit stays in that frozen spec" and the "Past rationale survives in the frozen spec + git" sentence (items 2 and 1); *Where to look* :43 drops the "/ working spec" parenthetical; :45-46 reroutes "what happened in this unit of work" from "its frozen working spec (+ git)" to the PR body.
  The two-family framing survives and gets cleaner: every remaining point-in-time row is a record that is actually kept.
- `docs/design-decisions/records-architecture.md` -- :3 classifies working specs and plans in the point-in-time family (Conformance item 1 makes a working spec not a record at all); :7 states "Plans are prunable once `Implemented`; specs never are", which delete-at-ship contradicts.
- `docs/design-decisions/epic-planning-tier.md` -- :3 "its epic entry becomes a pointer to that working spec" (the same clause struck from `#swe-epic`:36, rewritten to the delivery-state model) and :5 "frozen on `Approved`".
- `CONTRIBUTING.md` -- the *Records and history* paragraph (:66-72) is **rewritten**, not pruned, to describe the gitignored store; plus :30, :31 (the `bin/cli.js` verb list), :33, :80.
  And :78, in the same code block as :80: `npm run build -- --stdout` is documented there and does not work -- it expands to `node bin/cli.js install --stdout` and errors `unknown flag: --stdout`. Replace it with `node bin/cli.js --stdout`, for the reason Verification row 2 states. Pre-existing drift, fixed here because the change touches the block anyway.
- `docs/reference-spec/cli.md` -- the synopsis line (:11), the `spec-index` section (:60-71), and the *Flag migration* row `spec-index [--check] | spec-index [--check] | unchanged` (:171), which becomes actively false rather than merely stale; plus :98's "the working spec carries the transition rationale as point-in-time history".
- `README.md` -- :29 (declares `spec-index` a verb-first subcommand), :39 (`agentsmith spec-index --check` as recommended agent setup), :40 (links `cli.md#spec-index`, an anchor into a deleted section -- retarget or drop the link), :103 (the `/spec-index` command entry).
  `README` is always in scope per `#swe-docs-drift` and is the most consumer-facing surface asserting a removed command.

Citations to deleted working specs, all rephrased under one disposition rule -- **name git history as the record, never leave a path pointing at a removed directory**:

- `AGENTS.md`:27 (`#local-verify-the-gate`'s load-bearing evidence). Consumer-owned and never regenerated, so no instruction edit reaches it; it must be edited directly.
- `docs/reference-spec/review-board-protocol.md`:16 (cites `2026-06-26-board-unification` by name).
- `docs/future-work/2026-06-10-review-engine-extensions.md`:3, `2026-06-24-spec-review-learned-routing.md`:5, `2026-07-22-instruction-set-terminology-audit.md`:5 and :10.
- `devtools/triage-ui/schema.mjs`:3.

Path prose in the spec-review tooling: `tools/claude/skills/spec-review-board/SKILL.md`:39, `tools/claude/commands/spec-review-board.md`:8, `spec-review-board-wf.md`:7.

Deleted: all directories under `docs/working-specs/` plus `INDEX.md` -- **25 directories** (24 pre-existing plus this spec), per `(Get-ChildItem docs/working-specs -Directory).Count` against the pre-edit tree.

Recorded: `docs/technical-debts/` -- `git clean -xfd` destroys an in-flight scratch spec, accepted because a spec spans one branch and is cheap to reconstruct.

Consumer migration is manual but **documented**: `README.md` carries the one breaking step (delete `docs/working-specs/` after updating the instruction set), since consumers read the README and the generated core, and the regression guard below closes the instruction tree to any mention of the path.

## Verification

Every command below was executed against the **pre-edit** tree to confirm it runs and means what the row claims; each is re-run against the **post-edit** tree as the actual gate (`#local-verify-the-gate`).

| command | what it proves |
| --- | --- |
| `npm test` | the suite still runs with `test/spec-index.test.mjs` and the `cli.test.js` verb case gone and the `tools.test.js` fixture swapped; `test/instruction-integrity.test.mjs` re-checks dangling `#tag` references and ownership coverage across the ten edited rule bodies, **and the new two-leg regression guard passes** over both the source tree and the generated core, so neither removed token can be silently reintroduced |
| `node bin/cli.js --stdout` | the core forges cleanly, exit 0, with no dangling reference to a removed rule clause. **Not** `npm run build -- --stdout`: the `build` script is `node bin/cli.js install`, so that form expands to `install --stdout` and exits non-zero with `unknown flag: --stdout` -- verified, and it never forges anything |
| `git grep -n -e "working-specs" -e "spec-index" -- instructions` | returns nothing: no **rule source** still references the removed path or command. Tracked files only -- this is the rule-source half of the check. The token is the **bare** `working-specs`, matching the mechanical sweep rather than the `docs/`-prefixed form: this row is the post-edit gate over the change's own central corpus, so it must see the one orthography the sweep was widened to catch (`#ai-plan`:3's prefix-less "under working-specs") |
| `node bin/cli.js --stdout \| Select-String -Pattern "docs/working-specs","spec-index"` | returns nothing: no **generated output** still references either. A separate row because `git grep` cannot read the generated core -- `.agentsmith/` is gitignored, and `git grep` over an ignored pathspec matches nothing regardless of content, so folding this into the row above would produce a criterion that cannot fail |
| the Docs sweep above, re-run post-edit: `git grep -n -e "docs/working-specs" -e "working-spec" -e "spec-index" -e "specindex" -e "build:index" -e "check:index" -- . ":(exclude)docs/working-specs"` | the **docs corpus** is clean apart from an enumerated residual: no doc, `README`, `CONTRIBUTING`, consumer-owned `AGENTS.md`, or tooling-prose file still names the removed command or npm scripts. Without this row the largest and most consumer-facing part of the change has no gate -- the sweep would be pre-edit discovery only, and the `#swe-docs-drift` / `#swe-public-surface-docs` claims would rest on eyeballing |

This row does **not** return zero, and must not be written as if it did -- a criterion that trips on correct work is worse than none (`#local-verify-the-gate`:25). Two residuals are expected and enumerated, so anything else is a real hit:

1. The surviving **term** in any orthography -- `working-spec` (which is what the hyphenated pattern actually returns, e.g. "a working-spec directory") and "working spec" -- which stays legal throughout the set. This is distinct from the `docs/working-specs` **path**, a real hit everywhere except the README case below.
2. `README.md`'s consumer-migration sentence, which **must** contain `docs/working-specs` -- it tells consumers which directory to delete. This is the one place the change's two goals point opposite ways: the regression guard requires that string absent from rule sources and the generated core, while the README requires it present. The guard's legs cover `instructions/` and the forged core only, so the README is outside it by construction, not by exception.

New regression guard in `test/instruction-integrity.test.mjs`, so a later edit cannot silently reintroduce either token.
It has **two legs**, and the first is the one that matters:

1. **Source tree.** Walk `instructions/` in full using that file's existing `walk()` helper (:39), which reaches `instructions/frontend/`, `backend/`, and `authoring/`.
2. **Generated core.** `spawnSync('node', ['bin/cli.js', '--stdout'])` and grep the returned stdout, exactly as that file's two existing tests do (:30) -- and **never** read `.agentsmith/AGENTS.md` from disk, which is gitignored and absent on a fresh clone, so a read-from-disk implementation would throw `ENOENT` against correct work.

The second leg alone would be insufficient: default `--stdout` emits the lean core, which excludes bundle rule bodies (verified -- `ui-design-tokens` returns 0 hits), so a token reintroduced into a bundle-only file such as `instructions/authoring/ai-instruction-review.md` would go undetected. Leg 1 is what makes the guard's stated scope true.

Both legs match the **bare** `working-specs` and the **command** `spec-index` -- the same width as the mechanical sweep and Verification row 3, so all three mechanisms police one pattern set rather than three.
The prefixed `docs/working-specs` would be narrower than its own sibling sweep and would miss a prefix-less reintroduction.
This costs nothing: post-edit the only legitimate bare-plural hit is `#ai-plan`:3, which this change rewrites.

The singular *term* -- "working spec" and adjectival `working-spec`, in any orthography -- stays legal throughout the instruction set and is **not** matched by either leg, since neither is the plural token.
The bare **plural** `working-specs` is a real hit everywhere in `instructions/` and the generated core; that settles a form Verification row 5's residual 1 leaves ambiguous.

### Claims no command can fail

Row 5 is an absence sweep, so it cannot prove a positive inclusion. Three Scope claims are therefore confirmed by review, stated here rather than left to look gated:

- **The 25-directory deletion** -- confirmed by the PR's file-list diff, not by a command. Row 5's pathspec deliberately excludes `docs/working-specs`, so no named command looks at that corpus; a post-edit `Test-Path docs/working-specs` returning false is the one-line check if a command is wanted.
- **The `docs/technical-debts/` entry** -- a positive inclusion; nothing distinguishes authored from forgotten except that the file exists in the diff.
- **The `README.md` consumer-migration step** -- also positive; a README missing the migration sentence passes every row above. `git grep -n "docs/working-specs" README.md` cannot serve as the check, because the guard requires that string to be absent from rule sources while the README must mention the path it tells consumers to delete -- the one place the two goals point in opposite directions, and the reason this is review-confirmed rather than swept.

## Conformance

Conforms to `#swe-reference-spec` and the reference spec's present-truth/point-in-time model, and **deliberately diverges** from four present-truth positions, each updated in this change:

1. `docs/reference-spec/documentation-model.md` lists the working spec and working plan as point-in-time *records*.
   After this change a working spec is not a record at all -- not in `docs/`, not kept, never read later -- so both rows are removed rather than re-labelled.
   No third family is introduced; the two-family split is preserved.
2. `docs/design-decisions/records-architecture.md` is the standing rationale for that model and is rewritten in place, per `#swe-design-decisions`.
   Its prior rationale survives in git, not in a frozen spec -- consistent with deletion item 1 above, which is exactly the leg this change removes.
3. `docs/design-decisions/epic-planning-tier.md` justifies the epic tier partly by contrast with a working spec "frozen on `Approved`"; the contrast is restated against the mutable-but-ephemeral working spec, and the tier's justification is unaffected.
4. `docs/reference-spec/cli.md` documents `spec-index` as public surface; the command and its documentation are removed together.

The `#swe-branch-lifespan` interaction was **not** part of the agreed scope and was found while reading the rule sources; it is resolved above rather than silently absorbed.

## Non-goals

- Renaming `docs/reference-spec/` to `docs/specs/`.
  Considered and rejected: "reference" contrasts with the working-spec *concept*, which still exists uncommitted, so `#swe-terminology`'s qualified terms stay load-bearing; `docs/specs/` reads as a folder of specs, inviting the confusion it claims to fix; and the churn reaches every consumer path for no gain.
- A committed deliberation document in any form, under any name.
- Backlinks from a decision file to its referrers, or an intermediate index between them.
- A replacement for `spec-index` that sweeps `.agentsmith/specs/`.
- Automated consumer migration: consumers delete `docs/working-specs/` manually after updating.
