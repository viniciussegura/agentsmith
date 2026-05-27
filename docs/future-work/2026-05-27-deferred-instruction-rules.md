# Deferred instruction rules

Three instruction rules proposed by the `prompts/review-instructions.md` audit were not adopted in the latest cherry-pick.
They are parked here, per #swe-future-work, so the scratch file `docs/proposed-instructions.md` can be retired without losing them.
Each is a complete, house-style section ready to drop into its target file once its dependencies are met.

## Why these matter

A good software-engineering rule set covers testing discipline, CI enforcement, and schema-change safety.
The set currently asserts CI and testing obligations *indirectly* (#swe-security says scans run "in CI"; #swe-done says "tests pass locally") without a rule that defines either.
Closing these gaps makes those obligations first-class and checkable.

## Blocking dependency to resolve first

#swe-security (`instructions/swe.md`) already references `#swe-ci`, which does not yet exist -- a dangling cross-reference today.
Two ways out, pick one when scheduling this work:

1. Adopt #swe-ci (below), which also unblocks the reference. It in turn requires #swe-testing to exist first (it references it).
2. Or, if CI is deferred indefinitely, soften the #swe-security line to not name a `#swe-ci` tag.

Recommended order if adopting: #swe-testing, then #swe-ci, then #swe-migrations.

---

## 1. #swe-testing -- Target: `instructions/swe.md`

**What.** A rule mandating test-first development and behavior-focused tests.
**Why.** #swe-done item 1 ("tests pass locally") presumes tests exist but never says to write them or how. This defines the discipline.
**Dependencies.** References #swe-done, which already exists. No blockers -- adoptable now.

```markdown
## #swe-testing Testing

Write tests test-first: a failing test before the code that satisfies it.
Cover behavior, not implementation; a test that passes against a mock proves nothing.
Every bug fix starts with a test that reproduces the bug.
Tests live beside the code or under `test/`, mirroring the source layout.
A change is not done until its tests pass locally (#swe-done).
```

When adopted, link #swe-done item 1 back to `#swe-testing`.

---

## 2. #swe-ci -- Target: `instructions/swe.md`

**What.** A rule defining the minimum mechanical gate that blocks merge.
**Why.** Resolves the dangling `#swe-ci` reference in #swe-security and makes "enforced in CI" concrete rather than aspirational.
**Dependencies.** References #swe-testing (deferred above), #swe-security (exists), #code-markdown (exists), #git-title (exists). Adopt #swe-testing first or the reference dangles.

```markdown
## #swe-ci Continuous integration

CI enforces the rules that can be checked mechanically, and a red check blocks merge.
At minimum CI runs the test suite (#swe-testing), the linter and formatter (including #code-markdown), and a dependency vulnerability scan (#swe-security).
Conventional Commit titles (#git-title) are validated.
Keep the same checks available as a local pre-commit hook so failures surface before push.
```

---

## 3. #swe-migrations -- Target: `instructions/swe.md` (only if the project owns a database)

**What.** Rules for versioned, reversible, backward-compatible schema migrations.
**Why.** Schema changes are a common source of broken deploys and data loss; expand-contract and backup-before-destroy are the safe defaults.
**Dependencies.** References #swe-entity (exists). Project-conditional: adopt only when the project owns a database.

```markdown
## #swe-migrations Schema migrations

Every schema change ships as a versioned, reversible migration; never edit a released migration.
Migrations stay backward-compatible with the running code: expand first, contract later (add column, backfill, switch reads, then drop the old) so deploys need no hard cutover.
A destructive migration (dropping a column or table) requires a verified backup and explicit confirmation before it runs.
Keep the entity model (#swe-entity) in step with the migration.
```

---

## Adoption checklist

- Drop the block into `instructions/swe.md` in the suggested order (testing, ci, then migrations); #swe-done stays last in the file.
- Leave `manifest.json` emit order unchanged -- no new source file is introduced.
- Re-run `prompts/review-instructions.md` to confirm self-reference integrity (the `swe-ci` dangling warning should clear).
- Regenerate and confirm `node bin/cli.js --stdout` emits no `unresolved #tag references` warning.
