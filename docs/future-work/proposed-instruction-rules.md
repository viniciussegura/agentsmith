# Proposed instruction rules (rolling backlog)

Rolling backlog of instruction rules the `prompts/review-instructions.md` audit has proposed but the rule set has not yet adopted.
One file, rewritten in place each review round -- not dated snapshots.

How it updates each round: the review reads this file, drops anything already adopted into `instructions/`, re-checks that each remaining proposal still closes a real gap, rewrites stale entries, adds new gaps, and rebuilds the summary table below.
Each entry carries a drop-in, house-style block once the rule is concrete enough to draft.

## Summary

| Rank | Tag | Target | Gap it closes | Status |
|---|---|---|---|---|
| 1 | `#swe-testing` | `swe.md` | test-first discipline; backs #swe-done item 1 | ready |
| 2 | `#swe-code-review` | `swe.md` | only self-review exists today | ready |
| 3 | `#swe-ci` | `swe.md` | defines the merge gate | conditional (CI); ref needs #swe-testing |
| 4 | `#swe-migrations` | `swe.md` | schema-change safety | conditional (db) |
| 5 | `#front-i18n` | `front.md` (frontend bundle) | localization | ready (low priority) |
| 6 | `#swe-perf` | `swe.md` | performance budgets | ready (low priority) |

Since the last roll (two rolls back-to-back): Moves A and B (commits `5e00b1e`, `b10072a`) reworked the spec/plan workflow -- `#ai-plan` rewritten (per-unit `docs/working-specs/<date>-<slug>/` directories, `Status` tokens, append-only history), a new `#swe-reference-spec` added, `#swe-entity` re-homed to `docs/reference-spec/entity-model.md`, and `#swe-docs-drift` + `#swe-done` item 2 wired to the reference spec.
The first roll caught a contradiction the rewrite introduced (append-only vs `Status`-advance), proposed a `#ai-plan` amendment, and that amendment plus two term nits were adopted in commit `cafd2c3`.
This second roll re-checked post-`cafd2c3`: the three fixes are confirmed closed, and two minor source-edit nits surfaced (an unbolded hard "never" in `#swe-reference-spec` against bolded siblings; a redundant `#swe-display-messages` cross-ref in `#ui-canonical-states`) and were applied immediately as source edits, not new rules.
No backlog proposal was adopted or removed this roll.

The rule set is self-consistent: 38 source sections (28 core + 10 across the frontend and backend bundles) plus the generated `#on-demand` section; every `#tag` resolves, no dangling reference, no duplicate tag, and no core-to-bundle reference.

---

## 1. #swe-testing -- Target: `swe.md`

**Gap.** #swe-done item 1 ("tests pass locally") presumes tests exist but never says to write them or how.
**Rationale.** Test-first is discipline, not a tech-stack dependency, so it stays light across project sizes.
**Status.** Ready -- references #swe-done (exists), no blockers. When adopted, link #swe-done item 1 back to `#swe-testing`.

```markdown
## #swe-testing Testing

Write tests test-first: a failing test before the code that satisfies it.
Cover behavior, not implementation; a test that passes against a mock proves nothing.
Every bug fix starts with a test that reproduces the bug.
Tests live beside the code or under `test/`, mirroring the source layout.
A change is not done until its tests pass locally (#swe-done).
```

## 2. #swe-code-review -- Target: `swe.md`

**Gap.** #swe-done requires self-review only; no rule covers a deliberate review pass.
**Rationale.** Self-review is the floor; a deliberate pass catches scope creep and drift a linter cannot.
The adversarial spec auto-review (#ai-spec-review) already proves the house values independent review of specs; this extends the principle to code.
**Status.** Ready -- references #swe-done, #swe-docs-drift (exist). Phrased to fit solo and AI-only work.

```markdown
## #swe-code-review Code review

Before a change squash-merges to `main`, it gets a deliberate review pass against these instructions; self-review (#swe-done) is the floor, not the ceiling.
Review correctness, scope, and documentation drift (#swe-docs-drift) -- not style a linter already enforces.
Solo or AI-only work still earns this pass; the author reviews the full diff with fresh eyes before merge.
```

## 3. #swe-ci -- Target: `swe.md`

**Gap.** No rule defines the mechanical merge gate; enforcement is implied, never stated.
**Rationale.** Makes "enforced" concrete -- but only where CI exists, so it must stay conditional to keep the rule set portable (personal vs enterprise, small vs large).
**Status.** Conditional (only where the project runs CI). Adopt #swe-testing first or the `#swe-testing` reference dangles.

```markdown
## #swe-ci Continuous integration

Where the project runs CI, it enforces the rules that can be checked mechanically, and a red check blocks merge.
At minimum CI runs the test suite (#swe-testing), the linter and formatter (including #code-markdown), and a dependency vulnerability scan (#swe-security).
Conventional Commit titles (#git-title) are validated.
Keep the same checks available as a local pre-commit hook so failures surface before push.
```

## 4. #swe-migrations -- Target: `swe.md` (only if the project owns a database)

**Gap.** No rule for versioned, reversible, backward-compatible schema change.
**Rationale.** Schema changes are a common source of broken deploys and data loss; expand-contract and backup-before-destroy are the safe defaults.
**Status.** Conditional (only when the project owns a database). References #swe-entity (exists).

```markdown
## #swe-migrations Schema migrations

Every schema change ships as a versioned, reversible migration; never edit a released migration.
Migrations stay backward-compatible with the running code: expand first, contract later (add column, backfill, switch reads, then drop the old) so deploys need no hard cutover.
A destructive migration (dropping a column or table) requires a verified backup and explicit confirmation before it runs.
Keep the entity model (#swe-entity) in step with the migration.
```

## 5. #front-i18n -- Target: `front.md` (frontend bundle)

**Gap.** #front-display-labels covers entity names, but nothing covers localization.
**Rationale.** Retrofitting i18n after hard-coded text and locale-blind formatting have spread is expensive.
**Status.** Ready. Lower priority -- adopt when the product targets more than one locale.

```markdown
## #front-i18n Internationalization

User-facing text is externalized, never hard-coded inline, so it can be translated without code changes.
Format dates, numbers, and currencies by locale rather than assuming one.
Do not assume text length or direction -- layouts tolerate longer translations and right-to-left scripts.
```

## 6. #swe-perf -- Target: `swe.md`

**Gap.** No rule on performance expectations or regressions.
**Rationale.** Without a budget, performance erodes one unmeasured change at a time.
**Status.** Ready. Lower priority -- most valuable once a hot path is identified.

```markdown
## #swe-perf Performance budgets

Set a budget for the paths that matter (response time, payload size, query count) and treat a regression past it as a bug.
Measure before optimizing; no speculative optimization without a number that justifies it.
```
