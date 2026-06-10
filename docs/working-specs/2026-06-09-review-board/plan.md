# Plan: Role-based review (code & instructions)

Date: 2026-06-09
Status: Implemented
Spec: `docs/working-specs/2026-06-09-review-board/spec.md` (approved)

## Overview

The spec defines a shared review engine with two applications and a tag-ownership model.
This plan sequences that into four phases in dependency order (`#swe-agile`), **all landing on this one branch** (`spec/review-board`) and squash-merging as a single PR.
Phasing here is execution order and reviewable checkpoints, not separate merges.

- **Phase 1 -- Code-review board.** The portable rules `#ai-review-engine` + `#ai-review-board`, the **full role set** (all eight lenses + verifier + PM), the full round pipeline (setup -> reconcile+review -> verify -> persist -> reduce -> present), the committed issue store, the `/review-board` + `/review-promote` commands, and a dogfood round in this repo.
- **Phase 2 -- Role-rule ownership.** `instructions/ownership.yaml` + `instructions/roles.yaml`, the coverage lint in `src/bundles.js`, and the `swe` base-lens formalization. Catches orphan/double-owned tags in CI and is the gate Phase 3 opens with.
- **Phase 3 -- Instruction-review application.** `#ai-instruction-review`, the per-role fan-out over `instructions/`, the `instruction-editor` reduce rolling `docs/future-work/proposed-instruction-rules.md`, reusing the Phase 1 registry and the Phase 2 lint gate. Reconciles `prompts/review-instructions.md`.
- **Phase 4 -- Wrap-up + future-work registration.** Final docs-drift sweep across all phases and recording the genuinely out-of-scope items (extra roles, tracker bridge, non-Claude adapters) under `docs/future-work/`.

Each phase ends green on `npm test` and a clean `node bin/cli.js --stdout` (no dangling/cross-boundary tag warnings), with docs drift resolved in the same phase (`#swe-done`, `#swe-docs-drift`).
Commit granularity within the branch is free (one or more commits per phase); the squash collapses it at merge (`#git-branch-workflow`).

---

## Phase 1 -- Code-review board (v1)

### Step 1.1 -- Portable instruction rules

Edit `instructions/core/ai.md`, add immediately after `#ai-spec-review`:

- `#ai-review-engine` -- the shared core: role registry as compositions of instruction tags, the fan-out -> verify -> reduce -> present shape, the three adversarial filters (verify, PM consolidation, human promotion), and the three degradation modes.
- `#ai-review-board` -- the code-review application: the round pipeline, baseline derivation by `targetRef` (feature-branch -> `merge-base`; main -> prior main round), the status lifecycle, compositional ids `<roundId>#<role>-<n>`, and the hybrid persistence policy (committed canonical store + ephemeral scratch + `closed/`/`promoted/` partitions).

Terse, self-contained, one sentence per line (`#code-markdown`); the mechanics live in the spec and the skill, the rule is the contract.
`#ai-instruction-review` is **deferred to Phase 3** -- do not add it yet (no dangling reference, since nothing in v1 cites it).
Verify `node bin/cli.js --stdout` shows no dangling/cross-boundary warnings for the new tags.

### Step 1.2 -- Full role set

Ship **all eight** reviewer lenses from the spec's registry.
These are AI instruction artifacts meant for consumption by other repos (`frontend`/`ux`/`db` included): even though this repo has no front-end/DB surface to exercise them, they must ship here so downstream projects can install and test them.

- **Always-on**: `correctness`, `swe` (base lens).
- **Gated**: `security` (auth, secrets, env, sql, network), `docs` (`**/*.md`, `docs/**`), `qa` (`test/**`, `**/*.test.*`), `frontend` (`#front-*`/component-CSS paths), `ux` (flow/usability paths), `db` (`#swe-entity`/`#be-*` data paths).

Each role's gating row goes in the default `config.yaml`; `correctness` + `swe` are exempt from gating (always run).
Roles read their illustrative composition tags directly in Phase 1; the formal one-owner-per-tag map is Phase 2.
Phase 1 needs no ownership sidecar because a dirty issue's owning role is read from its id's `<role>` segment, not from the map.

### Step 1.3 -- Claude plugin artifacts

New committed source under `tools/claude/` (installed into `.claude/` by `npx agentsmith`, mirroring spec-review):

- `agents/review-correctness.md`, `review-swe.md`, `review-security.md`, `review-docs.md`, `review-qa.md`, `review-frontend.md`, `review-ux.md`, `review-db.md` -- the eight application-neutral reviewer personas; frontmatter `name` + `description` + read-only tools; body states the composed tags and the adversarial stance. The invoking skill supplies the subject (diff + touched files) and the `Issue` output schema.
- `agents/review-verifier.md` -- per-finding skeptic, biased to reject; subject supplied by the skill.
- `agents/review-pm.md` -- the reduce role (strong model): consolidate priority, group epics, apply the product-owner lens, write `triage.md`.
- `skills/review-board/SKILL.md` -- orchestrator: setup (mode/target/baseline derivation, role gating, dirtiness scan, confirmation gate), parallel fan-out, verify, persist, reduce, present.
- `skills/review-board/issue-format.md` -- reference: `Issue` / `FileLocation` / `RelatedIssue` / `ReviewRoundInfo` + status lifecycle + compositional id rules.
- `commands/review-board.md` -- `/review-board [--full-sweep] [<branch>]`: run a code-review round.
- `commands/review-promote.md` -- `/review-promote <issue-id...> <url>`: set `promotedTo` + status `promoted`, move to `promoted/`; idempotent.

The persona/skill prompts are proven by the Step 1.5 dogfood before they are frozen into these files (as spec-review did).

### Step 1.4 -- Persistence + config

- The skill creates and maintains the `reviews/` store in the **consumer** repo: `config.yaml`, `issues/<role>/{,closed/,promoted/}`, `epics/`, `rounds/<id>.yaml` + `rounds/<id>.triage.md` (layout per spec Persistence).
- The **default `config.yaml`** (active roles + gating table) is documented in the portable protocol (`#ai-review-board` / the skill), so Setup can create it on first run in any host, including degradation modes.
- Ephemeral scratch under `.agentsmith/tmp/review-board/<round-id>/` (gitignored) -- confirm `.gitignore` already covers `.agentsmith/tmp/`; add if not.
- No generator change is required: `tools/` already installs via the existing `src/tools.js` planner and `package.json` `files` entry (added in the spec-auto-review feature). Verify the new files land under `.claude/` with a scratch `npx`-style run; do not duplicate the planner.

### Step 1.5 -- Dogfood (gated on decisions 14 + 18)

Manually orchestrate one board round against a real diff in this repo with real sub-agent delegation for review/verify/PM, and confirm:

- a schema-valid issue store with globally-unique compositional ids;
- the verify stage rejects at least one **planted** false finding;
- `triage.md` groups issues into canonical epics;
- a `feature-branch` baseline = `merge-base(commit, main)`.

This proves the prompts before Step 1.3 freezes them and is the spec's primary verification.

### Step 1.6 -- Docs + tests

- `docs/entity-model.md` (**new file**): add `Issue`, `Epic`, `ReviewRoundInfo`, `FileLocation`, `RelatedIssue` as core entities (`#swe-entity`). `InstructionProposal` is added in Phase 3. The role spec and ownership map are config, not entities -- documented as config.
- `README.md`: add the board to the feature list and `tools/` inventory; document `/review-board` + `/review-promote` and the `reviews/` store.
- Tests: extend `test/cli.test.js` so a default run installs the new `.claude/` review files and `--no-tools` installs none (mirrors the spec-review cases). No new generator logic means no new `src/` unit module in v1.
- Set the spec `Status: Approved -> Implemented` when the phase merges.

### Phase 1 done criteria (`#swe-done`)

1. `npm test` green.
2. `node bin/cli.js --stdout` emits no dangling/cross-boundary warnings.
3. A scratch `npx`-style run installs the new `.claude/` review files and respects `--no-tools`.
4. The dogfood round produced a schema-valid store, a rejected planted finding, and an epic-grouped `triage.md`.
5. `docs/entity-model.md` + README updated; no remaining drift.
6. Any accepted shortcut recorded under `docs/technical-debts/` (e.g. the never-touched-file false-positive residual, decision 28).
7. Self-review against the instruction set.

---

## Phase 2 -- Role-rule ownership (deferred)

- `instructions/ownership.yaml` -- tag-keyed `#tag -> owner`, exactly one owner per tag; **never exported** (neither `AGENTS.md` nor the plugin), like `manifest.json`. Seed it from the spec's owner-class table over the current tag inventory.
- `instructions/roles.yaml` -- role metadata (lens, always-on vs gated, gating globs, per-application participation); owned-tag set **derived** from `ownership.yaml`, never hand-maintained.
- Coverage lint in `src/bundles.js` (extending the existing `#tag` scan): every `#tag` has exactly one resolvable owner (a declared role, the `swe` base lens, or the `process` non-review marker); orphans and double-ownership are CI failures; a role owning zero tags is a warning. Wire it into the build/CI path that already runs the dangling-tag check; add `test/bundles.test.js` cases for orphan, double-owned, and non-review-marker tags.
- Ensure `ownership.yaml`/`roles.yaml` are excluded from the export plan (`src/tools.js` / generate) and documented as config.
- Docs: note the ownership model in README/entity-model config section.

## Phase 3 -- Instruction-review application (deferred; depends on Phase 2)

- `#ai-instruction-review` in `instructions/core/ai.md`.
- `tools/claude/agents/instruction-editor.md`; `tools/claude/skills/instruction-review/{SKILL.md,proposal-format.md}`; `tools/claude/commands/instruction-review.md` (`/instruction-review`, full audit, no diff mode in v1).
- The round opens by running the Phase 2 coverage lint as its first finding source; fan-out per participating role over `instructions/` + `node bin/cli.js --stdout`; per-proposal verify; `instruction-editor` reduce rolling `docs/future-work/proposed-instruction-rules.md` in place.
- Add `InstructionProposal` to `docs/entity-model.md`.
- Reconcile `prompts/review-instructions.md` (invoke the fan-out, or retain as the single-agent fallback supplying the shared rubric).
- Add `instruction-review.participants` handling (skill default; optional override under that key in `reviews/config.yaml`).

## Phase 4 -- Wrap-up + future-work registration

- Final docs-drift sweep across all three prior phases (README, `docs/entity-model.md`, any `docs/` references), confirming nothing went stale as later phases edited shared files.
- Set the spec `Status: Implemented`.
- Record genuinely out-of-scope items under `docs/future-work/<date>-<slug>.md`: performance/accessibility/scalability roles, the GitHub/Jira API bridge, and non-Claude `tools/<ai>/` adapters.
- Confirm `npm test` green and `node bin/cli.js --stdout` clean one final time before opening the PR.

---

## Risks / notes

- **Prompt quality is the real risk, not plumbing.** The board's value rides on the reviewer/verifier/PM prompts; the dogfood (Step 1.5) is the gate, mirroring how spec-review proved its reviewer before freezing it. Budget the bulk of Phase 1 effort there.
- **Command-name collisions** with the host's built-in `/code-review` / `/security-review`: the plugin namespace handles this (the spec drops the old `as:` prefix idea); finalize the plugin/namespace name at the start of Step 1.3.
- **Installing into a consumer's `reviews/` and `.claude/` is opinionated**: mitigated by namespacing and the existing `--no-tools` opt-out. The board writing a `reviews/` tree into the consumer repo is by design (committed canonical store), but call it out in the README so it is not a surprise.
- **Per-round runtime validation in Claude Code is a post-merge check**, not a unit test -- the same boundary spec-review accepted.
- **Slicing risk**: if Phases 2-3 never follow, v1 still stands as a useful code-review board; the ownership lint and instruction-review are additive, not load-bearing for the board.
