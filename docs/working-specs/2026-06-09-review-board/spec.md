# Spec: Role-based review (code & instructions)

Date: 2026-06-09
Status: Approved

## Motivation

A diff gets one human reviewer with one set of blind spots, and most repos never get a security, UX, or docs-drift pass at all.
We want an opt-in **review board**: a fan-out of role-specialized reviewer sub-agents over the current repository state (or the diff between a branch and `main`), each raising issues through its own lens, followed by a project-manager reduce that verifies, deduplicates, groups the issues into epics, and writes a prioritized plan.
This is the second feature exercising agentsmith's broadened scope (after spec auto-review): shipping the tooling for best software-engineering practice with AI agents, not just a portable `AGENTS.md`.
The board is a lightweight, AI-friendly triage layer that sits *on top of* the team's official tracker (GitHub/Jira), not a replacement for it: a human promotes board issues into the official tracker, and that promotion is the human validation of the AI-raised issue.

The same role registry has a second, naturally-paired use: **reviewing an instruction set itself**.
Today `prompts/review-instructions.md` audits agentsmith's `instructions/` with a single umbrella reviewer across nine dimensions, rolling proposals into `docs/future-work/proposed-instruction-rules.md`.
Fanning that audit out **per role** -- the security lens asks "what security rule is missing?", the docs lens asks "what documentation rule is missing?", and so on -- gives sharper, less-diluted coverage from the very same lenses that review code.
So this spec defines a **shared role-based review engine** with two applications: **code review** (the board) and **instruction review**. The engine (roles, fan-out → verify → reduce, degradation, token discipline) is shared; subject, schema, persistence, and reconciliation differ per application, and the two ship independently (`#swe-agile`).

## Goals

- Define one **role registry** (the lenses + the instruction tags each composes) shared by both applications.
- **Code review (the board)**: on request, run role-specialized reviewers over the current state or a branch-vs-`main` diff, each emitting structured issues through its own lens; verify findings adversarially before persisting; reconcile prior issues through a status lifecycle; reduce with a PM role that consolidates priority, groups issues into epics, and writes a prioritized triage report; keep the issue store committed and human-readable while the per-run reasoning stays ephemeral.
- **Instruction review**: run the same roles over an instruction set (`instructions/` + generated `AGENTS.md`), each proposing missing or weak rules for its lens; verify each proposal closes a real, not-already-covered gap; reduce into the existing rolling backlog `docs/future-work/proposed-instruction-rules.md` (reusing `prompts/review-instructions.md`'s mechanics), proposing only -- never editing instruction sources.
- Make the protocol portable (tool-agnostic, reaching every assistant via `AGENTS.md`, with degradation modes), and ship Claude Code plugin artifacts that realize it with real sub-agent delegation.

## Non-goals

- Replacing the official issue tracker, or auto-pushing to GitHub/Jira over HTTP (a human promotes selected issues; an API bridge is future work).
- An inner convergence loop like spec auto-review: the board is a single fan-out + verify + reduce per round, not a reviewer/author ping-pong, so it has no convergence guard.
- Auto-fixing the code: the board raises and plans issues; fixing is a separate activity.
- Agent-executed deletion of issues or rounds: closed issues are partitioned, not deleted (see Persistence); git history is the archive.
- *Editing* instruction sources: the instruction-review application proposes only, writing to the rolling backlog; adopting a proposal into `instructions/` stays a deliberate human/author action (and may itself be auto-reviewed via `#ai-spec-review`).
- Roles beyond the initial set (performance, accessibility, scalability): documented as future work.

## Terminology

- **Application** -- one use of the shared engine: **code review** (the board) or **instruction review**. They share the role registry and the fan-out → verify → reduce shape; everything else (subject, schema, persistence, reconciliation, triggers) is application-specific.
- **Review round** -- one full execution of the engine for one application. To avoid drift with `#ai-spec-review` (where a "round" is one reviewer/author cycle), a review round here is *not* an inner loop: it is one pass (setup, fan-out, verify, persist/record, reduce). For code review it runs against the current commit, baselined per its target (a feature branch's merge-base with `main`, or the previous `main`-targeting round -- see step 1); successive commits or PRs trigger successive rounds over time. For instruction review it runs against the current instruction set.

## The protocol (portable)

This is the source of truth, expressed tool-agnostically and emitted via `AGENTS.md`.

### Shared engine

Both applications run the same shape: **Setup** (scope the subject, select roles) → **fan-out** (one reviewer sub-agent per selected role, in parallel, cheap model) → **verify** (an adversarial per-finding skeptic, biased to reject) → **reduce** (a PM/editor role on a strong model that consolidates, deduplicates, and writes the human-facing output) → **present**.
Roles, the verify-then-reduce filtering, the degradation modes, and the token-efficiency discipline are shared.
What differs per application: the **subject** reviewed, the **finding schema**, where results **persist**, and how a round **reconciles** with prior results. The two applications are specified separately below (Code-review application, Instruction-review application) over this shared spine.

### Roles

Each reviewer role has a stable `id` and is a curated **composition of existing instruction tags**, not a freshly invented persona -- this keeps reviewers in lockstep with the instruction set (`#swe-reuse`) instead of forking a second copy of "what good looks like".

The third column is the role's **composition** -- the tags it *reads* through its lens, which may overlap across roles. It is **illustrative and not the ownership contract**: *ownership* (the single home for a rule) is one-owner-per-tag in the sidecar (see Role↔rule ownership). A role may read a tag it does not own.

| id | lens | composes / reads (illustrative -- not ownership) |
|----|------|--------------------------------------------------|
| `correctness` | logic and behavior bugs in the change (**always runs**) | general correctness; the diff itself |
| `swe` | architecture, API design, code quality, **cross-cutting rules** (**always runs** -- this is the **base lens**) | `#code-*`, `#swe-naming`, `#swe-reuse`, `#swe-terminology`, `#swe-errors` |
| `frontend` | front-end architecture, component/CSS reuse, framework best practice | `#front-*`, component/CSS `#ui-*` |
| `ux` | information flow and usability for the end user | flow/usability `#ui-*` |
| `db` | data modeling and schema | `#swe-entity`, `#be-*` data rules |
| `qa` | test completeness and that tests actually pass | `#swe-done` (tests), test conventions |
| `docs` | documentation drift from the code | `#swe-docs-drift` (reads `#swe-entity`, owned by `db`) |
| `security` | security baseline and secrets | `#swe-security`, `#swe-environment` |

The **project manager (PM)** is the reduce role: it consolidates cross-lens priority, groups issues into epics, applies the **product-owner lens** (does the change serve the user/business and stay in scope), and writes the plan.
The PM is also the second adversarial filter over issues (after the per-finding verify stage and before human promotion).

The **role registry is a shared asset**: the same role definitions drive both applications. A role definition is application-neutral -- a lens plus the instruction tags it composes; each application's skill supplies the subject to review and the output schema. Mechanically, a role's composed tags define its **domain**, and the invoking skill's spawn prompt reframes the **task**: "find code that violates these tags" (code review, emitting an `Issue`) vs. "find rules this domain expects that these tags don't yet cover" (instruction review, emitting an `InstructionProposal`). One persona file, two tasks. "The instruction set is missing a rule" is therefore *not* a code-review finding (the board runs in consumer repos, where such a finding has no path home); it is exactly what the instruction-review application produces, in the agentsmith repo.

### Role ↔ rule ownership

**Composition vs ownership are different relations.** *Composition* is the many-to-many "what a reviewer reads" (the table above); overlap is fine. *Ownership* is the one-to-one "single home for a rule": every instruction rule (`#tag`) has **exactly one owner**, the role accountable for raising findings/proposals about it. A role routinely reads tags it does not own (e.g. `docs` reads `#swe-entity`, owned by `db`).

- **The base lens is `swe`.** Rather than invent a separate persona, the `swe` role *is* the always-on base lens: it owns the cross-cutting rules (`#code-*`, `#swe-naming`, `#swe-reuse`, `#swe-terminology`, `#swe-errors`) and, like `correctness`, runs on every code-review diff (so a cross-cutting violation in any file is caught and never gated out). `swe` is a declared registry row and has a `review-swe.md` persona; "base lens" is a role of `swe`, not a new agent.
- **Where ownership lives**: a committed, **tag-keyed** sidecar `instructions/ownership.yaml`, mapping `#tag → owner`. It is repo config -- like `manifest.json` -- and is **never exported**: it appears in neither the generated `AGENTS.md` nor the `tools/claude/` plugin. (Committed ≠ exported.) Keyed by tag, so adding a rule forces exactly one new row and a tag can never be claimed twice. Role *metadata* (lens, always-on vs gated, gating globs, per-application participation) lives in a companion `instructions/roles.yaml`; a role's owned-tag set is **derived** by querying `ownership.yaml`, never hand-maintained in `roles.yaml`.
- **Owner values**: a domain role (`security`, `db`, `frontend`, `ux`, `qa`, `docs`), the base lens (`swe`), or an explicit **non-review** marker (`process`) for rules outside the review taxonomy, so nothing is orphaned and nothing is force-fit under a role.
- **Owner classes over the current inventory** (illustrative -- the authoritative, exhaustive per-tag rows live in `ownership.yaml`, and the coverage lint requires exactly one row for *every* tag; this table is guidance for authoring those rows, not a substitute for them):

  | tag family | owner |
  |-----------|-------|
  | `#code-*`, `#swe-naming`/`-reuse`/`-terminology`/`-errors`/`-deps`/`-observability`/`-display-messages` | `swe` (base lens) |
  | `#swe-security`, `#swe-environment` | `security` |
  | `#swe-entity`, `#be-*` | `db` |
  | `#swe-docs-drift` | `docs` |
  | `#swe-done` | `qa` |
  | `#swe-agile`, `#swe-future-work`, `#swe-technical-debts` | `swe` (process/quality) |
  | `#front-*`, component/CSS `#ui-*` | `frontend` |
  | flow/usability `#ui-*` | `ux` |
  | `#ai-*`, `#git-*`, `#swe-reference-spec` | `process` (non-review) |

  Because `ownership.yaml` is exhaustive and lint-enforced, a tag not anticipated by this table (a future addition, or an edge like the `#ui-*` split) cannot silently orphan -- it simply needs its one explicit row, decided per-tag in the sidecar (the `#ui-*` component/CSS-vs-flow split is *not* derivable from the glob and is adjudicated there).
- **Granularity**: ownership and the lint operate strictly at `#tag` level. Untagged bundle prose (intros in `front.md`, `ui-guidelines.md`) is owned implicitly by whoever owns that file's tags, or is out of the review taxonomy -- it is not separately tracked.
- **File layout may mirror ownership** for readability but holds no authority; a misfiled rule is still correctly owned via the map.
- **Coverage lint**: extending the existing `#tag` validation (`src/bundles.js`), a lint asserts **every `#tag` has exactly one ownership row**, every owner resolves to a declared role / the base lens / a known non-review marker, and (warning) every role owns ≥1 tag. Orphans and double-ownership are CI failures, so the mapping cannot drift silently. The lint enforces *completeness*; the instruction-review application (below) supplies the *judgment* on whether each rule is well-located and well-owned.

## Code-review application

Reviews a repo's code. This is "the board". The pipeline, schema, persistence, and filters below are specific to this application.

### Round pipeline

1. **Setup** (main thread).
   Determine the **mode** -- `diff` (branch vs `main`) or `full-sweep` (re-examine the whole project regardless of changes); default is `diff`, and the mode/target are confirmable at the gate below, so this need not be a separate prompt.
   Record the round's **target** (`targetRef`): `feature-branch` (the usual case -- reviewing a branch before it merges) or `main` (a periodic review of what has landed on `main`).
   Resolve the reviewed **`commit`** and the **baseline** (`baselineCommit`, always a live `main` SHA -- never undefined) by target:
   - **`feature-branch`**: `commit` = the branch tip; `baselineCommit = merge-base(commit, main)`, recomputed from git each round. No chaining off stored metadata, and squash-safe because a merge-base is always a `main` commit -- once a branch squash-merges, the next branch's merge-base is the new post-merge `main` commit, so the merged work is never re-reviewed.
   - **`main`**: `commit` = current `main` HEAD (a durable `main` SHA the next `main` round chains off); `baselineCommit` = the `commit` of the **most recent prior `main` round**. If none exists, the round **bootstraps**: it is forced to `full-sweep` (see Mode precedence below) and records `baselineCommit =` current `main` HEAD.
   A **`full-sweep`** computes no diff (it examines the whole subject), so its own reconciliation re-checks every prior open issue regardless of dirtiness; it still records `baselineCommit` by the rule above as the `main`-anchored `lastConfirmedCommit` it stamps on confirmed issues, so the *next* round's dirty test has a current anchor. So `baselineCommit` is always defined.
   Throughout, `main` denotes the repo's **configured default branch**, resolved once at setup; if a branch shares no history with it (orphan/unrelated, so `merge-base` is empty), the round falls back to a `full-sweep` with `baselineCommit =` current default-branch HEAD.
   The **first round in a repo** is always a `full-sweep` with no carry-forward.
   **Mode precedence**: the mode is forced to `full-sweep` (overriding the user's `diff` default) whenever no usable baseline diff exists -- the first repo round, or the first `main` round with no prior `main` round.
   Compute the diff over `baselineCommit..commit` for a `diff` round, or take the whole-project surface for a `full-sweep`.
   **Select roles** from `reviews/config.yaml` (see Persistence), which lists the project's active roles and a gating table of path globs → role ids: a role runs when the diff touches a path matching its globs, or a commit message in the range `baselineCommit..commit` matches its keywords.
   `correctness` always runs regardless of the table; a `full-sweep` runs every role listed active in the config; the user may force-add a role.
   Setup also runs the **dirtiness scan** (step 2's test) over all prior open issues and **force-selects the owning role of any dirty issue**, even if the path-gating table would not have selected it -- otherwise a dirty issue whose owning role's gated paths went untouched would never be reconciled.
   Path/message gating is a default heuristic with this safety net plus the always-on `correctness` reviewer, never a silent skip of a relevant reviewer.
   If `reviews/config.yaml` is absent (e.g. first run, or a non-plugin host), Setup creates it from the default documented in the portable protocol before selecting.
   **Confirmation gate**: before fan-out, Setup presents the resolved `mode`, `targetRef`, `baselineCommit` (and how it was derived), and the selected role set for the user to confirm or override **in one interaction** -- a wrong baseline or role set wastes an entire fan-out. This single gate is where the user adjusts mode/target/roles; there is no separate earlier prompt. An explicit non-interactive invocation may skip the gate and proceed with the computed defaults.
2. **Reconcile + review** (parallel, one sub-agent per selected role, cheap model).
   A prior issue is **dirty** (must be reconciled) when `git diff <issue.lastConfirmedCommit>..<commit>` touches any path in its `locations` -- the test diffs to `commit` (the code actually under review, e.g. the branch tip) so branch-only changes are caught; this uses the diff's rename map, so a renamed or deleted file makes the issue dirty regardless of its recorded `filename`. (The *stored* anchor is `main`-anchored -- see the confirm step below -- even though the *test* diffs to `commit`.)
   The dirty scan covers both **open** issues and **recently-closed** ones (those whose `closedInRound` is within a bounded window, default the last 3 rounds), so a regression can reopen its original issue rather than minting a new id. (Closing does **not** advance `lastConfirmedCommit` -- a closed issue keeps the anchor from its last open-confirmation -- so its dirty test diffs from before the fix and therefore catches a regression.)
   For each dirty issue the role re-checks whether it still holds against the current code (re-reading the relevant file) and transitions it: an open issue to `fixed` / `deprecated` / `superseded` / `duplicated` or still `open`; a recently-closed issue back to `open` if the concern has regressed (a **reopen**, preserving the id). On confirming still-`open`, it updates the `FileLocation`s to the current text and sets `lastConfirmedCommit = baselineCommit` (a `main` SHA, so the anchor never dangles after a squash-merge). The re-check is a real validity test, not mere file-membership.
   In the same pass the role raises new findings.
   A prior open issue that is **not dirty** carries forward unchanged with no re-read (cheap); a `full-sweep` re-checks every prior open issue regardless of dirtiness, and is the only mechanism that re-examines a carried issue in a file that is never touched again (see the technical-debt note in Verify).
   A `full-sweep` advances `lastConfirmedCommit = baselineCommit` (derived in step 1) for every issue it re-confirms, so the anchor stays current and squash-safe.
3. **Verify** (adversarial, parallel, per new finding).
   Verify is **one-time-at-entry**: it runs only on findings new this round, challenging each against the actual code; the verifier defaults to rejecting when it cannot substantiate the finding.
   Rejected findings are dropped before persistence (they live only in ephemeral scratch).
   Carried-forward issues are not re-verified -- retiring a now-invalid carried issue is reconcile's job (step 2), which is why reconcile must re-check validity, not just file membership.
   A false positive that slips past verify and then sits in a file never touched again is caught only by a `full-sweep`; this residual gap is an accepted limitation recorded under `#swe-technical-debts`, with periodic `full-sweep` as the mitigation.
4. **Persist** (main thread).
   Write verified new issues to the store under their already-minted compositional ids (no allocation step -- see Id allocation); apply the reconciled status transitions; move newly-*closing* issues to the `closed/` partition. Promotion and the `promoted` status are **not** set here -- that is the human-driven `/review-promote` step, which moves the issue to the `promoted/` partition.
5. **Reduce** (PM role, strong model).
   Read all open issues (verified-new plus carried-forward) as summaries, consolidate priority across lenses, group related issues into epics (creating/updating canonical epics), mark duplicates `duplicated` (linking the survivor), optionally down-rank/reject, and write the prioritized `triage.md`.
6. **Present** (main thread).
   Summarize the round -- including the **count of findings the verify stage rejected** and the path to their ephemeral transcripts -- so a human can spot-check verify's drops (the bias-to-reject default makes silently losing a real finding the likelier failure than admitting a false one).
   Offer to promote selected issues/epics into the official tracker via the companion command (human validation step); promoting records the tracker URL in `promotedTo` and sets status `promoted` (which the next round neither re-raises nor reopens).

### Data formats

```typescript
type Priority = 'low' | 'medium' | 'high';
// high   = data loss, security exposure, or breaks users / the build
// medium = degrades quality, maintainability, or correctness without breaking users
// low    = cosmetic or nice-to-have
// Priority is a within-lens judgment; the PM consolidates across lenses using priorityRationale.

type IssueStatus = 'open' | 'promoted' | 'fixed' | 'deprecated' | 'superseded' | 'duplicated';
// 'promoted' is NOT a closing status (see Status lifecycle): the issue was validated and escalated to
// an external tracker, so it is neither re-raised (not open) nor reopen-eligible (not closed).
type IssueKind = 'issue' | 'epic';

interface FileLocation {
  filename: string;          // repo-relative path
  lines: [number, number];   // inclusive; a single line means lines[0] === lines[1]
  snippet: string;           // first/last N chars of the line content with '...' elision;
                             // a relocation hint, NOT a key (line numbers and content both drift)
}

interface RelatedIssue {
  issueId: string;           // the related issue's globally-unique id (its <roundId> prefix encodes the origin round)
  description: string;       // why they relate (child-of, duplicate-of, superseded-by, ...)
}

interface Issue {
  id: string;                // globally-unique compositional id "<roundId>#<role>-<n>" (epics: "<roundId>#epic-<n>").
                             // The <roundId> prefix encodes the origin round; the <role> segment, the owning role.
                             // Minted locally by the raising round -- no global allocation step (see Id allocation).
  kind: IssueKind;
  title: string;
  description: string;       // markdown
  priority: Priority;
  priorityRationale: string; // one line: why this level, in the reviewer's lens
  status: IssueStatus;
  lastConfirmedCommit: string; // the main SHA (a baselineCommit) at which this issue was last verified;
                             // reconcile's dirtiness test diffs from here to `commit` (see step 2); main-anchored so it never dangles
  locations?: FileLocation[];
  relatedIssues?: RelatedIssue[]; // for an epic (kind: 'epic'), these are its child issues
  closedInRound?: string;    // round id in which status became a *closing* one; the recently-closed dirty window counts back from here
  promotedTo?: string;       // external tracker URL/ref; set together with status 'promoted' by /review-promote
  closingComments?: string;  // e.g. fixing commit/PR, what superseded/duplicated it, why deprecated
}

interface ReviewRoundInfo {
  id: string;                // round id == its directory name (see Persistence)
  mode: 'diff' | 'full-sweep';
  targetRef: 'main' | 'feature-branch'; // selects baseline derivation (see Round pipeline step 1)
  commit: string;            // the reviewed commit; for feature-branch rounds the branch tip (may dangle
                             // after squash); for main rounds the current main HEAD that the next main round chains off
  baselineCommit: string;    // ALWAYS a live main SHA, never undefined: merge-base for feature-branch rounds;
                             // the last main round's commit (or current main HEAD on bootstrap) for main rounds.
                             // Used as the lastConfirmedCommit anchor for issues this round raises/confirms.
  previousRound?: string;    // prior round id (any target); see also the last main-targeting round for chaining
  roles: string[];           // reviewer role ids triggered this round
}
```

### Status lifecycle

Each status has one meaning and one owning stage that may set it:

| status | meaning | set by |
|--------|---------|--------|
| `open` | live, unaddressed | reviewer (on raise), reconcile (on confirm still-open, or **reopen** of a recently-closed issue that regressed) |
| `promoted` | validated by a human and escalated to the external tracker (`promotedTo` set); tracked there now -- **not** a closing status | `/review-promote` (human action) |
| `fixed` | the code now addresses it | reconcile (step 2) |
| `deprecated` | no longer relevant (the concern itself went away) | reconcile (step 2) |
| `superseded` | replaced by a newer, broader issue (link it via `relatedIssues`) | reconcile (step 2) or PM (step 5) |
| `duplicated` | a duplicate of another open issue (link the survivor via `relatedIssues`) | PM (step 5, during consolidation) |

A **closing** status (`fixed` / `deprecated` / `superseded` / `duplicated`) sets `closingComments`, stamps `closedInRound`, and moves the file to the `closed/` partition; only closing statuses within the recently-closed window are reopen-eligible.
`promoted` is **not** a closing status: it moves the file to a separate `promoted/` partition and is excluded from **both** the open-issue dirty scan (so it is never re-raised) **and** the recently-closed reopen set (so it is never reopened) -- once a human escalates an issue, the external tracker owns its lifecycle. A promoted issue is therefore **frozen** in the store: its `lastConfirmedCommit` and `locations` are intentionally not advanced, even if its file later changes; the tracker is the source of truth from that point.

### Id allocation

Ids are **compositional and minted locally** -- no provisional ids and no Persist-stage allocation scan. An issue's id is `<roundId>#<role>-<n>`, where `<roundId>` is the raising round (globally unique -- round ids never repeat) and `<n>` is that role's local counter within the round. So the full id is globally unique by construction; a role simply numbers its own findings `1, 2, 3, ...` within the round, with no knowledge of other rounds or roles. The counter `<n>` counts only findings **newly raised** this round; carried-forward and reopened issues keep their origin-round id and do not consume this round's counter. Epics are `<roundId>#epic-<n>`, minted by the PM in the round that creates them.
Because the `<roundId>` prefix encodes the **origin round** and the `<role>` segment the **owning role**, the separate `raisedInRound` field is unnecessary, and `RelatedIssue` needs only the `issueId` (it already carries the round). Setup's force-selection of a dirty issue's owning role (step 1) reads the `<role>` segment.
Ids are **never reused** (round ids are never reused), so `relatedIssues` references stay valid forever; a regression reopening its *own* prior id (step 2) is reuse-of-self, not reallocation. The trailing `<slug>` in a filename is a non-authoritative decoration that may be regenerated if a title is reworded -- identity keys off the id, not the slug. The **Persist** stage (step 4) therefore only writes/moves files; it allocates nothing.

### Persistence

Hybrid, mirroring spec auto-review's committed-result / ephemeral-process split.

**Committed** -- a single canonical, living issue store (not per-round folders, which would duplicate every carried-forward issue and churn git diffs):

```
reviews/
  config.yaml                                      active roles + gating table; also instruction-review.participants
  issues/<role-id>/<id>-<slug>.yaml                open issues (id = <roundId>#<role>-<n>), mutated in place across rounds
  issues/<role-id>/closed/<...>.yaml               issues with a CLOSING status (fixed/deprecated/superseded/duplicated)
  issues/<role-id>/promoted/<...>.yaml             issues escalated to the external tracker (status 'promoted'); NOT closed
  epics/<epic-id>.yaml                             canonical epics (id = <roundId>#epic-<n>), mutated in place
  rounds/<round-id>.yaml                           one ReviewRoundInfo per round (the durable diff-chain anchor)
  rounds/<round-id>.triage.md                      the PM triage report for that round (per-round, kept for history)
```

`<round-id>` follows `<YYYY-MM-DD>[<letter>]-<target-branch>` (the optional letter disambiguates multiple rounds the same day, e.g. `2026-06-09b-feature-x`); it is the `<roundId>` prefix in every id minted that round. Filenames render the id filesystem-safely (the `#` separator may be rendered as `--`).

`config.yaml` lists each active role id and its gating globs/keywords; it is the single source the Setup gating and `full-sweep` role set read from, and it is hand-maintained (a new role is activated by adding a row). The **default config is documented in the portable protocol** (e.g. `correctness` always-on, `docs` gated on `**/*.md` + `docs/**`), not only shipped with the plugin, so Setup can create it on first run in any host -- including the single-agent and manual degradation modes that run without the plugin.

**Epics are canonical, not per-round.** The PM mutates epics in place across rounds: it adds/removes child links as issues appear and resolve. An epic stays `open` while any child is `open`. Once no child is `open`, the epic rolls up by its children's terminal states: if **all** children are *closing* it becomes `fixed` (or the dominant closing reason) → `epics/closed/`; if any child is `promoted` (and none open) the epic becomes `promoted` → `epics/promoted/` (since the work is escalated, not done). This prevents a promoted child from masquerading as a fixed epic. The per-round `triage.md` is the disposable narrative; the epics themselves are durable.

**The board's `triage.md` is deliberately not named `plan.md`** to avoid colliding with an `#ai-plan` execution plan; it is a prioritized triage report, not an approved implementation plan.

**Squash-merge safety**: squash-merging a feature branch destroys its branch-tip SHA, so the protocol never chains off a feature-branch `commit`.
A `feature-branch` round derives its baseline as `merge-base(targetCommit, main)` (always a live `main` commit), so after a branch merges, the next branch's merge-base is the new post-merge `main` commit and the merged work is not re-reviewed.
A `main` round chains off the `commit` of the previous `main`-targeting round, which is a durable `main` SHA (never rewritten).
Either way `baselineCommit` is always a live `main` SHA; `lastConfirmedCommit` is anchored to it for the same reason.

**Ephemeral** (`.agentsmith/tmp/review-board/<round-id>/`, gitignored, never committed): each reviewer's raw output, the verifier transcripts (including rejected findings), and the PM's deliberation.
These transcripts are retained at least until the round's `triage.md` has been reviewed and any promotion done, since the Present step's human spot-check of verify's rejections depends on them; they are not cleaned mid-round.
Git history is the archive for closed issues; no agent ever deletes store files.

### Three adversarial filters

A finding must survive all three before it becomes team work, which is what keeps the committed store trustworthy:

1. **Verify stage** -- a per-finding skeptic drops hallucinations and unsubstantiated findings (cheap, parallel).
2. **PM consolidation** -- merges duplicates, down-ranks noise, may reject on product judgment.
3. **Human promotion** -- a person promotes the issue into the official tracker; nothing reaches the team's backlog without this.

## Instruction-review application

Reviews an **instruction set** (in the agentsmith repo: `instructions/` plus the generated `AGENTS.md`, read via `node bin/cli.js --stdout` so the review reflects the inlined output consumers receive). It generalizes `prompts/review-instructions.md` from one umbrella reviewer to a per-role fan-out, and **proposes only** -- it never edits instruction sources.

### Round pipeline (deltas from the shared engine)

1. **Setup** -- the subject is the whole instruction set, not a diff, so a round always runs a **full audit** (no `diff` variant in v1; the ancestor `prompts/review-instructions.md` has none either, and the application has no commit baseline to diff against). Which roles **participate** is configured per application: not every code lens maps to instruction rules, so a role may be active for code review yet inactive here (e.g. `correctness` audits code, not rules) -- the registry is shared, role *participation* is per-application. The participating set defaults to a list documented in the portable protocol and carried by the `instruction-review` skill. A repo that also runs the board may override it under a distinct `instruction-review.participants` key in `reviews/config.yaml`; a repo with no board (and so no `reviews/` tree) simply uses the skill default -- the two applications never share config shape, only the optional file.
   The round **opens by running the ownership coverage lint** (see Role↔rule ownership) as its **first finding source**: any orphan (unowned) or double-owned `#tag` becomes the round's first proposal(s) (a `reowner`/`new-rule` to assign or de-conflict an owner), since an unowned rule is one no reviewer lens would ever cover. This is propose-only like the rest of the application: `ownership.yaml` is inside the propose-only boundary, so the round **proposes** ownership fixes into the backlog rather than editing the map, and proceeds with the orphan recorded. (The hard gate against orphans is the *CI* coverage lint at commit time -- decision 35 -- not this round.)
2. **Fan-out** -- each participating role reviews the instruction set through its lens, emitting `InstructionProposal`s for: (a) **coverage** -- a rule its domain expects that is missing or too weak; (b) **per-lens quality** -- clarity, terseness, efficiency, and enforceability of rules already in its domain; (c) **ownership & placement** -- whether a rule it owns (or one it believes belongs to its lens) is owned by the right role and located in the best file, proposing a `rehome` or `reowner` change where not. The **global/structural** rubric dimensions (self-reference integrity, lean-split integrity, normative voice) are *not* per-lens; they run once in the reduce pass, owned by the editor, so no role duplicates them.
3. **Verify** -- a per-proposal skeptic confirms the gap is **real and not already covered** by a live `#tag` (re-reading the generated output and grepping tags), biased to reject; this is the analogue of the backlog's "does it still close a real gap?" step.
4. **Reduce** -- the `instruction-editor` role consolidates per-role proposals, deduplicates across lenses, runs the one-time global/structural rubric pass, reconciles `rehome`/`reowner` proposals (resolving any contested ownership to a single owner, and **rejecting/normalizing any `reowner` whose `proposedOwner` is not a resolvable owner** -- a declared role, the base lens, or a known non-review marker), ranks everything, and **rolls the backlog** `docs/future-work/proposed-instruction-rules.md` in place per `prompts/review-instructions.md`'s maintenance steps: drop proposals already adopted into `instructions/`, re-check remaining ones, add new ones, and rebuild the summary table. It confirms the ownership map would remain **complete and single-owner** under the proposed changes.
5. **Present** -- summarize what moved, what closed, and recommend the top few to draft next.

### Data format

```typescript
type ProposalKind =
  | 'new-rule'    // a rule the domain expects but the set lacks
  | 'strengthen'  // an existing rule that is too weak/ambiguous
  | 'rehome'      // an existing rule that should move to a different instructions/ file
  | 'reowner';    // an existing rule whose ownership row should change owner

interface InstructionProposal {
  kind: ProposalKind;
  tag: string;        // new #tag (new-rule) or an existing #tag (strengthen/rehome/reowner)
  role: string;       // role id (lens) that raised it -- ties the proposal to the shared registry
  gap: string;        // the gap or problem it addresses
  rationale: string;  // one line
  status: 'ready' | 'blocked' | 'conditional'; // matches the backlog's statuses; adopted proposals are
                      // dropped from the backlog by the reduce step, not retained with a status
  blockedOn?: string; // a #tag or condition, when status is 'blocked'/'conditional'
  targetFile?: string;    // new-rule/strengthen: the instructions/ file the rule belongs in
  draft?: string;         // new-rule/strengthen: a drop-in house-style rule block, once concrete
  proposedFile?: string;  // rehome: where the rule should move
  proposedOwner?: string; // reowner: the role / base lens / non-review marker it should be owned by
}
```

The fields are TypeScript-optional but **required per `kind`**: `new-rule` and `strengthen` require `targetFile` (the destination/existing file, matching `prompts/review-instructions.md`'s "target file"); `new-rule` also requires `draft` once concrete; `rehome` requires `proposedFile`; `reowner` requires `proposedOwner` (which must be a resolvable owner). The reduce step rejects a proposal missing its kind's required field.

### Persistence

The **only** file this application writes is the committed rolling backlog `docs/future-work/proposed-instruction-rules.md` (reusing the existing artifact and its format). There is no issue store, no epics, no `ReviewRoundInfo`, and no commit-anchored baseline -- the backlog **is** the only persistent state, and reconciliation **is** the in-place backlog roll (drop adopted, re-check remaining, add new). A round needs no knowledge of prior rounds beyond what the backlog records, so there is no round store. Per-role raw outputs and verify transcripts are ephemeral under `.agentsmith/tmp/instruction-review/<round-id>/`, where `<round-id>` is date-based (`<YYYY-MM-DD>[<letter>]`, no target branch -- instruction review has no branch).

### Relationship to `prompts/review-instructions.md`

That prompt is the single-umbrella ancestor. On adoption it is updated to either invoke this per-role fan-out (preferred) or be retained as the degraded single-agent fallback (its nine dimensions become the shared rubric the roles apply). Either way there is one backlog and one rubric -- no duplication (`#swe-reuse`).

## Graceful degradation

Like `#ai-spec-review`, the protocol is portable and degrades by host capability (applies to both applications):

1. **Plugin / delegated** (Claude Code) -- real sub-agents fan out in parallel for review and verify; the PM is a distinct reduce agent.
2. **Single-agent role-play** -- one agent assumes each role's stance sequentially, emitting the same artifacts; parallelism and independence are absent but the pipeline, schemas, and store are identical.
3. **Manual** -- a human supplies findings; the agent maps them onto the schema, runs verify/reconcile/reduce, and maintains the store.

## Token efficiency

The board is designed to be cheap by construction:

- **Parallel fan-out** for review and verify (independent per role / per finding).
- **Model tiering**: reviewers and verifiers run on a cheap model (pattern-matching work); the PM reduce runs on a strong model (judgment work).
- **Smallest context**: each reviewer gets only the diff, its touched files, and its profile tags -- never the whole repo. The diff is computed once and passed by reference.
- **Role gating**: only roles relevant to the change run (path + commit-message signal), except the always-on `correctness` and `swe` (base lens) reviewers and explicit `full-sweep`.
- **Carry-forward without re-read**: prior open issues in untouched files are carried forward unchanged, not re-reviewed (except in a full-sweep).
- **Summaries into the reduce**: the PM groups on issue summaries (title, priority, rationale, locations) and pulls full descriptions only for the issues it actually merges.
- **Structured output**: reviewers/verifiers return schema-validated objects, so there is no parse-and-repair overhead feeding the next stage.

## Claude Code implementation (plugin)

Unlike spec auto-review (which deferred plugin packaging), these features ship as a **plugin** from the start, for two reasons the user called out: real namespacing avoids colliding with the host's built-in `/code-review` and `/security-review`, and a versioned bundle is the clean distribution unit.
The portable protocol lives in `instructions/` and reaches every assistant via `AGENTS.md`; non-Claude tools (ChatGPT, Gemini) run it in a degradation mode by reading that protocol -- that is their fallback.

```
tools/claude/                        (installed into .claude/, gitignored, by `npx agentsmith`)
  agents/
    review-correctness.md            } the shared role registry: one adversarial reviewer persona per
    review-swe.md                    } role, each stating the instruction tags it composes. Application-
    review-frontend.md               }   neutral -- the invoking skill supplies the subject (code diff
    review-ux.md                     }   or instruction set) and the output schema (Issue or
    review-db.md                     }   InstructionProposal) in its spawn prompt.
    review-qa.md
    review-docs.md
    review-security.md
    review-verifier.md               per-finding skeptic (verify stage); subject supplied by the skill
    review-pm.md                     code-review reduce: consolidate priority, group epics, write triage
    instruction-editor.md            instruction-review reduce: dedupe proposals, roll the backlog
  skills/
    review-board/
      SKILL.md                       code-review orchestrator: setup, fan-out, verify, persist, reduce
      issue-format.md                reference: Issue / FileLocation / ReviewRoundInfo + lifecycle + id allocation
    instruction-review/
      SKILL.md                       instruction-review orchestrator: audit instructions/, roll the backlog
      proposal-format.md             reference: InstructionProposal schema + backlog maintenance steps
  commands/
    review-board.md                  /review-board [--full-sweep] [<branch>]: run a code-review round
    review-promote.md                /review-promote <issue-id...> <url>: record the tracker URL in promotedTo, set
                                     status 'promoted', move to promoted/; idempotent -- skips already-promoted issues
    instruction-review.md            /instruction-review: run an instruction-review round (full audit; no diff mode in v1)
```

Plugin name and command namespace are finalized in the plan; they must not collide with the host's built-in review commands (drop the earlier `as:` idea -- the plugin namespace does this properly).

## Instruction rule

Add to `instructions/core/ai.md`, adjacent to `#ai-spec-review`:

- `#ai-review-engine` -- the shared core: the role registry, the tag-keyed ownership model (one owner per tag; never-exported sidecar; coverage lint), the fan-out → verify → reduce → present shape, and the three degradation modes. Both applications reference it.
- `#ai-review-board` -- the code-review application: the round pipeline (setup → reconcile+review → verify → persist → reduce → present), the three adversarial filters, baseline derivation by `targetRef`, and the hybrid persistence policy (committed canonical store, ephemeral scratch, `closed/` partition).
- `#ai-instruction-review` -- the instruction-review application: per-role audit of an instruction set gated on the ownership coverage lint, emitting `new-rule`/`strengthen`/`rehome`/`reowner` proposals, propose-only into the rolling backlog `docs/future-work/proposed-instruction-rules.md`, reusing the shared rubric.

## Resolved decisions

1. **Hybrid persistence**: committed canonical issue store + ephemeral process scratch (not all-committed, not all-ephemeral).
2. **Canonical store, not per-round folders**: issues live once and mutate in place across rounds, avoiding cross-round duplication.
3. **`baselineCommit` is always a live `main` SHA**, derived by `targetRef`: a `feature-branch` round uses `merge-base(targetCommit, main)` (no chaining, squash-safe); a `main` round chains off the previous `main`-targeting round's `commit`. The protocol never chains off a feature-branch commit.
4. **Closed issues are partitioned to `closed/`, never agent-deleted**; git history is the archive.
5. **3-level priority with concrete definitions + `priorityRationale`** (not a 5-level scale -- false precision reviewers apply inconsistently).
6. **`FileLocation` = filename + inclusive line range + elided snippet**, where the snippet is a relocation hint, not a key.
7. **`kind` discriminator**: `issue` | `epic`. (`instruction-gap` was cut -- see decision 13.)
8. **Role gating on path + commit messages**, with `correctness` always-on and a `full-sweep` override, chosen by the user at setup.
9. **Reconciliation is fused into the review pass** over touched files; untouched-file issues carry forward without re-read.
10. **Three adversarial filters**: per-finding verify, PM consolidation, human promotion.
11. **No inner convergence loop** (distinguishes this from `#ai-spec-review`).
12. **Ships as a plugin** with the portable protocol as the non-Claude fallback.
13. **`instruction-gap` is cut from the board**: the board runs in consumer repos, where a gap in agentsmith's instruction set has no path home. Auditing the instruction set is instead the **instruction-review application** (decision 29), which reuses the shared role registry in the agentsmith repo.
14. **Ids are compositional and minted locally**: `<roundId>#<role>-<n>` (epics `<roundId>#epic-<n>`), globally unique by construction (round ids never repeat). No provisional ids and no Persist allocation scan; `raisedInRound` and `RelatedIssue.roundId` collapse into the id prefix.
15. **Status lifecycle is defined with one owning stage per status** (table in the spec); *closing* statuses move the file to `closed/`, `promoted` moves it to `promoted/`, and `open` stays in the active store.
16. **Reconciliation keys off a dirtiness test**: a prior issue is reconciled iff `git diff lastConfirmedCommit..commit` (with rename detection) touches one of its paths; non-dirty issues carry forward without re-read; `full-sweep` re-checks all.
17. **Verify is one-time-at-entry** (new findings only); retiring stale carried issues is reconcile's job, which performs a real validity re-check.
18. **The round records `targetRef` (`main` | `feature-branch`)**, which selects baseline derivation (decision 3). The first round in a repo bootstraps as a `full-sweep` with no carry-forward.
19. **Epics are canonical and mutated in place** (not per-round), with the issue status lifecycle and their own `closed/` partition; the per-round `triage.md` is the disposable narrative.
20. **The board's reduce output is `triage.md`, not `plan.md`** (avoids `#ai-plan` collision); `RelatedIssue` keys off the globally-unique `issueId` alone (the round is encoded in the id).
21. **`promoted` is a non-closing status**: a promoted issue carries `promotedTo` (the tracker URL), moves to the `promoted/` partition, and is excluded from **both** the re-raise scan (not open) and the reopen set (not closed); `/review-promote` sets it and is idempotent on already-promoted issues.
22. **`reviews/config.yaml` is the resolved home** for active roles and the gating table; its default is documented in the portable protocol (not plugin-only) and Setup creates it when absent.
23. **Setup force-selects the owning role of any dirty prior issue**, so reconciliation cannot be skipped by path-gating.
24. **`lastConfirmedCommit` is a `main` SHA** (the round's `baselineCommit`), keeping the dirtiness anchor squash-safe.
25. **The dirty scan includes recently-closed issues** (bounded window) so a regression **reopens** the original id instead of minting a new one.
26. **The stable id key is the compositional id** (`<roundId>#<role>-<n>` / `<roundId>#epic-<n>`); the filename `<slug>` is regenerable decoration and `#` may be rendered filesystem-safely.
27. **Setup has a confirmation gate**: it presents the derived `baselineCommit`, `targetRef`, and selected role set for the user to confirm or override before fan-out (skippable in an explicit non-interactive run).
28. **Residual false-positives in never-touched files are an accepted limitation** (`#swe-technical-debts`), mitigated by periodic `full-sweep`.
29. **Two applications over one shared engine and role registry** -- code review (the board) and instruction review -- specified together, shipping independently (`#swe-agile`).
30. **Instruction review proposes only**, reusing the existing rolling backlog `docs/future-work/proposed-instruction-rules.md` and `prompts/review-instructions.md`'s rubric and maintenance steps; no issue store, epics, or commit baseline.
31. **Role agents are application-neutral**; the invoking skill supplies the subject (code diff or instruction set) and the output schema (`Issue` or `InstructionProposal`).
32. **`prompts/review-instructions.md` is reconciled on adoption** -- either updated to invoke the per-role fan-out or kept as the single-agent degraded fallback; one backlog, one rubric.
33. **Role↔rule ownership is by tag, not by file**: a one-file-per-role restructure of `instructions/` is out of scope (cross-cutting rules would duplicate or be arbitrarily assigned; high blast radius). File layout may mirror ownership but is not the contract; any `swe.md` split is a separate concern-driven refactor.
34. **Ownership lives in a committed, tag-keyed sidecar** (`instructions/ownership.yaml`-style), `#tag → owner`, **never exported** to `AGENTS.md` or the plugin (repo config, like `manifest.json`). Exactly one owner per tag: a domain role, the always-on **base lens** (cross-cutting tags), or an explicit **non-review** marker (`#ai-*`/`#git-*`/process). The role spec holds role metadata; its owned-tag set is **derived** from the map, not hand-maintained.
35. **A coverage lint** (extending `src/bundles.js`) makes every `#tag` have exactly one resolvable owner -- orphans and double-ownership are CI failures -- so the mapping cannot drift silently. The always-on set is `correctness` **plus the base lens** that owns cross-cutting tags (refines decision 8).
36. **Instruction review owns the ownership *judgment***: each round opens with the coverage lint as a gate, and roles may emit `rehome`/`reowner` proposals; the editor reconciles them to a single owner and confirms the map stays complete. The lint enforces completeness; instruction review decides best location and best owner.

## Open questions

1. Closed-issue retention: keep in `closed/` indefinitely vs prune by age/round-distance (and if pruned, by whom -- a human command, never the agent). Not blocking: indefinite retention is the safe default for v1.
2. Concrete model-tier defaults per stage (implementation detail for the plan).

Resolved during round 1 review (now under Resolved decisions): triage persistence (per-round, decision 20), the project role set / gating home (`config.yaml`, decision 22), and verifier independence (a distinct `review-verifier` agent, decision 17 / implementation tree).

## Verification

- **Entity model** (`#swe-entity`): `Issue`, `Epic`, `ReviewRoundInfo`, `FileLocation`, `RelatedIssue`, and `InstructionProposal` are durable core entities, so creating/updating `docs/entity-model.md` with these types is part of the change (the file does not exist yet; this change introduces it). The role spec and the `#tag → owner` ownership map are tooling **config** (like `manifest.json`), not core review entities, and are documented as config rather than in the entity model.
- **Dogfood** (gated on the id and bootstrap-baseline decisions being settled -- decisions 14 and 18 -- so "sane store" is falsifiable): run the board (manually orchestrated, with real sub-agent delegation for review/verify/PM) against a real diff in this repo before the skill/commands exist, and confirm it produces a schema-valid issue store with globally-unique compositional ids, a verify stage that rejects at least one planted false finding, and a `triage.md` that groups issues into canonical epics.
- **Promote check**: promote an issue via `/review-promote`, confirm it gets status `promoted` + `promotedTo` and moves to `promoted/`, then run another round and confirm it is neither re-raised nor reopened.
- **Reconcile check**: plant a prior issue, change its file in a later round, and confirm reconcile re-checks validity and transitions it (not merely matches the filename).
- **Schema check**: emitted YAML validates against the `Issue` / `ReviewRoundInfo` types.
- **Squash-merge / baseline check**: run a `feature-branch` round (baseline = `merge-base`), squash-merge the branch, then run a new `feature-branch` round off updated `main` and confirm its merge-base is the post-merge commit (the merged work is not re-reviewed and the old branch SHA is never referenced). Separately, run two `main`-targeting rounds and confirm the second chains off the first's `commit`.
- **Token check**: a `diff` round on a backend-only change does not spawn the `frontend`/`ux` reviewers, and untouched-file issues are carried forward without re-read.
- Once implemented, the first real code-review round in the repo exercises the command, the gating, the verify stage, and the PM reduce end to end.
- **Instruction-review dogfood**: run `/instruction-review` against this repo's `instructions/`, and confirm it (a) fans out per role, (b) rejects at least one proposal already covered by a live `#tag`, and (c) rolls `docs/future-work/proposed-instruction-rules.md` in place (drops adopted, re-checks remaining, adds new) without editing any `instructions/` source.
- **Shared-registry check**: a named role exercises both applications from one persona file -- e.g. the single `review-security.md` produces a security `Issue` in a code-review round and a security-rule `InstructionProposal` (against `#swe-security` / `#swe-environment` coverage) in an instruction-review round. Roles whose lens does not map to instructions (e.g. `correctness`) are simply inactive for instruction review, not duplicated or stubbed.
- **Ownership lint check**: introduce an orphan `#tag` (no ownership row) and a double-owned `#tag`, confirm the coverage lint fails CI for both; restore single ownership and confirm it passes. Confirm `#ai-*`/`#git-*` rules pass via the non-review marker, not by being forced under a role.
- **Ownership-judgment check**: an instruction-review round opens with the coverage lint gate, and can emit a `rehome` and a `reowner` proposal that the editor reconciles to a single owner while keeping the map complete.

## Future work

Recorded under `docs/future-work/` when the spec is approved:

- Additional roles: performance, accessibility, scalability (benefit both applications).
- Official-tracker API bridge: promote issues into GitHub/Jira programmatically.
- Adapters for non-Claude tools under `tools/<ai>/`.
