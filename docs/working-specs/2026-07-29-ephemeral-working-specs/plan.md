# Plan -- Ephemeral working specs

Status: Approved

Executes [`spec.md`](./spec.md) (Approved). Waves run in order; steps inside a wave are independent unless noted.
Steps are cited as *wave.step* (e.g. 3.2). Every line number in the spec is a **pre-edit anchor** -- locate by quoted text, not by number (spec, Scope preamble).

## Wave 0 -- Commit the approved artifacts

The spec is currently untracked. Committing it first is deliberate: this branch deletes `docs/working-specs/` in wave 6, so the spec is only ever visible to a reviewer if it exists in the branch's commit history. The last committed working spec is the one that abolishes them.

1. Commit `docs/working-specs/2026-07-29-ephemeral-working-specs/` (spec + this plan) and the regenerated `INDEX.md`.

`INDEX.md` is already regenerated and the suite is green (322 tests, 0 fail) -- this is the pre-edit baseline, so any later failure is attributable to the change.

## Wave 1 -- Instruction rules

Ten rule bodies. The semantic core of the change; everything downstream verifies against it.

| step | file | edit |
| --- | --- | --- |
| 1.1 | `core/ai/ai-plan.md` | four strikes (:9 freeze, :3 path + `#swe-docs-layout` xref, :15-17 index, :14 whole) and the four additions listed under the spec's Scope table |
| 1.2 | `core/swe/swe-reference-spec.md` | :6's "immutable point-in-time history" only -- :7 and :8 stand |
| 1.3 | `core/swe/swe-branch-lifespan.md` | revision vs revisit; superseded dirs read-only; retention vs :22 -- :8 stands |
| 1.4 | `core/swe/swe-design-decisions.md` | three deletions, one addition, plus :5's **opening** contrast |
| 1.5 | `core/code/code-style.md` | comment carve-out |
| 1.6 | `core/git/git-pr-body.md` | item 2 inline scope + update-on-re-approval |
| 1.7 | `core/swe/swe-done.md` | per-branch item 3 dropped; item 5 clause added; :4 stands |
| 1.8 | `core/swe/swe-docs-layout.md` | remove the `docs/working-specs/` row |
| 1.9 | `core/swe/swe-epic.md` | :36 strike, :7 contrast, :23 split + format constraint, delivery state, bird's-eye cap, `units-of-work/` collapse |
| 1.10 | `core/ai/ai-spec-review.md` | :3 path; **:14 partitioned, not struck**; threshold reference direction; :10 keeps its own condition |

**Wave gate:** `node bin/cli.js --stdout` exits 0 with no dangling-tag or cross-boundary warning. `instructions/ownership.yaml` untouched (no `#tag` added or removed).

## Wave 2 -- Tooling removal (breaking) and tests

1. Delete `bin/spec-index.js`, `src/specindex.js`, `test/spec-index.test.mjs`, `tools/claude/commands/spec-index.md`.
2. `bin/cli.js` -- all four sites: the `runSpecIndex` import (:9), comment (:27-29), dispatch (:30-52), `HELP` synopsis (:59). The import is the one that breaks every invocation if missed.
3. `package.json` -- drop `build:index` and `check:index`.
4. `test/tools.test.js` -- **fixture swap, not deletion**: replace the `spec-index.md` fixture with `tools/claude/commands/spec-review-board.md` and keep both halves of the positive-inclusion assertion.
5. `test/cli.test.js` -- delete the verb case (:380-386); it carries no other assertion.
6. `test/instruction-integrity.test.mjs` -- add the two-leg regression guard: leg 1 walks `instructions/` via the existing `walk()`; leg 2 captures `spawnSync('node', ['bin/cli.js', '--stdout'])`. Bare `working-specs` + `spec-index`. Never reads `.agentsmith/AGENTS.md`.

No plugin-manifest regeneration: `bin/build-plugin.js` is pure-templated and commands are auto-discovered.

**Wave gate:** `npm test` green. The new guard passes only because wave 1 is done -- if it fails, wave 1 is incomplete.

## Wave 3 -- Present-truth docs (rewrites)

1. `docs/reference-spec/documentation-model.md` -- remove both working-spec rows and the INDEX line; the four decided edits (Boundary 1 loses "and specs"; Boundary 2 loses the reach-test clause and frozen-spec provenance; *Where to look* :43 parenthetical; :45-46 reroute to PR body).
2. `docs/design-decisions/records-architecture.md` -- rewrite; :3's point-in-time classification and :7's prune asymmetry.
3. `docs/design-decisions/epic-planning-tier.md` -- :3's pointer clause and :5's freeze phrase.
4. `docs/reference-spec/cli.md` -- synopsis :11, section :60-71, migration row :171, and :98.
5. `CONTRIBUTING.md` -- *Records and history* rewritten; :30, :31, :33, :78 (the broken `npm run build -- --stdout`), :80.
6. `README.md` -- :29, :39, :40 (retarget or drop the `cli.md#spec-index` anchor), :103, **plus the consumer-migration step**.

## Wave 4 -- Citations and tooling prose

1. Citations to deleted working specs, one disposition -- name git history, never a removed path: `AGENTS.md`:27, `docs/reference-spec/review-board-protocol.md`:16, the three `docs/future-work/` files, `devtools/triage-ui/schema.mjs`:3.
2. Spec-review tooling paths: `tools/claude/skills/spec-review-board/SKILL.md`:39, `tools/claude/commands/spec-review-board.md`:8, `spec-review-board-wf.md`:7.

`AGENTS.md` is consumer-owned and never regenerated -- it must be edited directly.

## Wave 5 -- Sweeps

1. Mechanical sweep, every hit goes: `git grep -n -e "working-specs" -e "spec-index" -- instructions` -> 0.
2. Judgement sweep, dispose of each hit: `git grep -n -e mutable -e self-replacing -e immutable -e frozen -e point-in-time -e committed -- instructions`. Keep the enumerated stays (superseded-dir prose, surviving point-in-time family, `#swe-epic`:9, `#ai-spec-review`:14's second clause, and the unrelated `committed` uses incl. `#ai-instruction-review`:8-9).

**Wave gate:** mechanical sweep at zero; every judgement-sweep hit disposed or on the enumerated stay list.

## Wave 6 -- Deletion and records

1. `docs/technical-debts/2026-07-30-scratch-spec-loss.md` -- `git clean -xfd` destroys an in-flight scratch spec; accepted, cheap to reconstruct.
2. Delete all 25 directories under `docs/working-specs/` plus `INDEX.md` -- **including this spec and plan**. Last step of the wave, because everything above reads them.

## Wave 7 -- Verify and open the PR

1. Full Verification table against the post-edit tree:
   - `npm test`
   - `node bin/cli.js --stdout` (exit 0)
   - `git grep -n -e "working-specs" -e "spec-index" -- instructions` -> nothing
   - `node bin/cli.js --stdout | Select-String -Pattern "working-specs","spec-index"` -> nothing
   - the docs sweep -> only the two enumerated residuals (the singular term in any orthography; README's migration sentence)
2. Review-confirmed, not gated (spec, *Claims no command can fail*): the 25-directory deletion (PR file list), the technical-debt file, the README migration step.
3. Open the PR. Body per `#git-pr-body`: **approved scope and acceptance signal inline** -- the spec is not committed in the final tree, so a link is not a record. Model per `#git-usage`.
4. `#local-pr-version`: set `package.json` to `1.0.0-rc.<pr-number>`, then `npm run build:plugin` (the manifest derives its version and drifts silently otherwise).

## Not in this plan

- The squash-merge -- the human performs it (`#git-branch-workflow`).
- `#ai-review-board` on the finished diff: non-trivial by every `#ai-plan` criterion, so it is warranted before merge (`#swe-done` per-branch item 4), and it is a separate invocation.
- `#swe-consolidation-audit` applies only to a branch carrying more than one unit of work; this branch carries one.
