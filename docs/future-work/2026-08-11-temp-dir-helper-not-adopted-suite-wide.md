# Adopt `makeTempDir` across the nine remaining `mkdtempSync` test files

Recorded 2026-08-11, during the temp-directory cleanup fix (`fix/test-temp-dir-cleanup`).

## What

`test-helpers/tmp-dir.mjs` exports `makeTempDir(t, prefix)`, which creates a temp directory and registers its removal on the `node:test` context.
Three test files use it: `test/spec-review-guard.test.js`, `test/review-persist.test.js`, `test/triage-server.test.mjs`.

Nine others still create temp directories with a local `try`/`finally`, roughly 45 `mkdtempSync` call sites in total:

| File | `mkdtempSync` calls | Shape |
| --- | --- | --- |
| `test/cli.test.js` | 30 | inline `try`/`finally` per test |
| `test/round-guard.test.mjs` | 4 | inline `try`/`finally` per test |
| `test/execute.test.js` | 2 | inline `try`/`finally` per test |
| `test/list-modules.test.js` | 2 | inline `try`/`finally` per test |
| `test/manifest.test.js` | 2 | `tmp()` factory, cleanup at the call site |
| `test/round-context.test.mjs` | 2 | `inTempDirs(fn)` scoped-callback helper |
| `test/review-lint.test.js` | 1 | inline `try`/`finally` per test |
| `test/skill-cli-entry.test.mjs` | 1 | inline `try`/`finally` per test |
| `test/triage-apply.test.mjs` | 1 | inline `try`/`finally` per test |

Do not audit this table by tallying `mkdtempSync` against `rmSync` per file -- several files call `rmSync` for fixture teardown unrelated to their temp directory, so the counts do not pair.

## Why it matters now

The suite carries two implementations of one concept, which is the shape `#swe-reuse` calls a bug.
`inTempDirs` in `test/round-context.test.mjs` is the clearest case: a scoped-callback helper doing exactly what `makeTempDir` does, in a different idiom.

Nothing is broken -- all nine clean up correctly, measured flat across a full run -- so this is consistency, not a leak.
The cost is a reviewer reading two idioms and a contributor guessing which to copy.
The next new test file is where that guess gets made, and copying the `try`/`finally` shape is what reintroduced the original debt.

## Proposed action

Migrate the nine to `makeTempDir(t, prefix)` in a follow-up branch, deleting `inTempDirs` and `tmp()` as their call sites convert.
Each test signature gains the `t` parameter; each `try`/`finally` collapses to a single call.

Convert `test/cli.test.js` on its own -- at 30 call sites it is two thirds of the work and carries all of the review risk.

## Constraints

Purely mechanical; no behavior change and no new coverage.

A converted test that forgets the `t` parameter throws `TypeError: Cannot read properties of undefined (reading 'after')` rather than silently leaking, so the migration fails loud.
Verify the same way the original fix was verified: count directories for the affected prefixes in `os.tmpdir()` across a full `npm test`, and confirm the count is flat.
A `mkdtempSync` whose directory outlives one test cannot use `makeTempDir` as it stands -- `t.after` is per-test -- so check for a shared-across-tests directory before converting a file.

## Why it was deferred

Scoped out of `fix/test-temp-dir-cleanup`, whose approved scope was the three leaking files the technical debt named plus their consolidation.
The nine are not leaking, so folding them in would have widened a mechanical fix to twelve files without fixing anything.
