# Proposed instruction rules (rolling backlog)

Rolling backlog of instruction rules the `prompts/review-instructions.md` audit has proposed but the rule set has not yet adopted.
One file, rewritten in place each review round -- not dated snapshots.

How it updates each round: the review reads this file, drops anything already adopted into `instructions/`, re-checks that each remaining proposal still closes a real gap, rewrites stale entries, adds new gaps, and rebuilds the summary table below.
Each entry carries a drop-in, house-style block once the rule is concrete enough to draft.

## Summary

| Rank | Tag | Target | Gap it closes | Status |
|---|---|---|---|---|
| 1 | `#swe-testing` | `swe.md` | test-first discipline; backs #swe-done item 1 | ready |
| 2 | `#swe-ci` | `swe.md` | defines the merge gate | conditional (CI); ref needs #swe-testing |
| 3 | `#swe-api-versioning` | `swe.md` | versioning/deprecation absent from #swe-api-first | ready |
| 4 | `#swe-observability` | `swe.md` | health/metrics/tracing beyond logging | ready |
| 5 | `#swe-code-review` | `swe.md` | only self-review exists today | ready |
| 6 | `#swe-naming` | `swe.md` | naming conventions implied by #code-style/#swe-reuse, never stated | ready |
| 7 | `#swe-migrations` | `swe.md` | schema-change safety | conditional (db) |
| 8 | `#front-i18n` | `front.md` (frontend bundle) | localization | ready |
| 9 | `#swe-perf` | `swe.md` | performance budgets | ready |

Adopted since last roll: none -- this round broadened `#swe-display-messages`, cleared the last dangling reference (`#ui-canonical-states` now points at `#swe-display-messages`), and normalized the `#swe-security` CI wording. Added `#swe-naming` to the backlog.
The rule set is currently self-consistent: 32 sections, every `#tag` resolves, no dangling references.

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

## 2. #swe-ci -- Target: `swe.md`

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

## 3. #swe-api-versioning -- Target: `swe.md`

**Gap.** #swe-api-first fixes entity shapes but says nothing about evolving the contract over time.
**Rationale.** Breaking a released shape silently is the most common way an API betrays its consumers.
**Status.** Ready -- references #swe-api-first (exists).

```markdown
## #swe-api-versioning API versioning and deprecation

Version the API contract; a breaking change to a released shape ships under a new version, never by mutating the old one.
Mark a superseded field or endpoint as deprecated before removal, with a documented migration path for consumers.
Entity variations (#swe-api-first) stay stable within a version.
```

## 4. #swe-observability -- Target: `swe.md`

**Gap.** #swe-errors covers logging, but nothing covers metrics, tracing, or health checks.
**Rationale.** Logs alone do not tell you whether the system is healthy or where a cross-service request failed.
**Status.** Ready -- references #swe-errors (exists).

```markdown
## #swe-observability Observability

Beyond logging (#swe-errors), expose the signals needed to see the system's health: key operations emit metrics, and a request crossing services carries one correlation or trace id end to end.
Provide a health or readiness check for any long-running service.
Keep signals actionable -- enough to locate a failure, not vanity counters.
```

## 5. #swe-code-review -- Target: `swe.md`

**Gap.** #swe-done requires self-review only; no rule covers a second pair of eyes.
**Rationale.** Self-review is the floor; a deliberate review pass catches scope creep and drift a linter cannot.
**Status.** Ready -- references #swe-done, #swe-docs-drift (exist). Phrased to fit solo and AI-only work.

```markdown
## #swe-code-review Code review

Before a change squash-merges to `main`, it gets a deliberate review pass against these instructions; self-review (#swe-done) is the floor, not the ceiling.
Review correctness, scope, and documentation drift (#swe-docs-drift) -- not style a linter already enforces.
Solo or AI-only work still earns this pass; the author reviews the full diff with fresh eyes before merge.
```

## 6. #swe-naming -- Target: `swe.md`

**Gap.** #code-style favors named identifiers and #swe-reuse keys off names, but no rule states the conventions themselves.
**Rationale.** A single naming convention per kind keeps the codebase searchable and #swe-reuse enforceable.
**Status.** Ready -- references #swe-reuse (exists).

```markdown
## #swe-naming Naming conventions

Names follow one convention per kind, applied consistently: files, identifiers, and the casing each uses are uniform across the codebase.
A name says what a thing is or does, not how it is built; rename when its purpose drifts.
Match the surrounding code's existing convention over importing a new one (#swe-reuse).
```

## 7. #swe-migrations -- Target: `swe.md` (only if the project owns a database)

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

## 8. #front-i18n -- Target: `front.md` (frontend bundle)

**Gap.** #front-display-labels covers entity names, but nothing covers localization.
**Rationale.** Retrofitting i18n after hard-coded text and locale-blind formatting have spread is expensive.
**Status.** Ready. Lower priority -- adopt when the product targets more than one locale.

```markdown
## #front-i18n Internationalization

User-facing text is externalized, never hard-coded inline, so it can be translated without code changes.
Format dates, numbers, and currencies by locale rather than assuming one.
Do not assume text length or direction -- layouts tolerate longer translations and right-to-left scripts.
```

## 9. #swe-perf -- Target: `swe.md`

**Gap.** No rule on performance expectations or regressions.
**Rationale.** Without a budget, performance erodes one unmeasured change at a time.
**Status.** Ready. Lower priority -- most valuable once a hot path is identified.

```markdown
## #swe-perf Performance budgets

Set a budget for the paths that matter (response time, payload size, query count) and treat a regression past it as a bug.
Measure before optimizing; no speculative optimization without a number that justifies it.
```
