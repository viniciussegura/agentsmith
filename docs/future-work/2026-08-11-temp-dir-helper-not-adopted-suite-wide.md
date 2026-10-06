# Adopt `makeTempDir` across the nine remaining `mkdtempSync` test files

## What

`test-helpers/tmp-dir.mjs` exports `makeTempDir(t, prefix)`, which creates a temp directory and registers its removal on the `node:test` context; six test files use it.
Nine still create temp directories with a local idiom, 45 `mkdtempSync` call sites in total, and `test/cli.test.js` carries both idioms: its older tests use `mkdtempSync` with inline `try`/`finally`, while the docs-layout-config tests appended to it use `makeTempDir`.
Migrate the nine, deleting `inTempDirs` and `tmp()` as their call sites convert; convert `test/cli.test.js` on its own, since at 30 call sites it is over half the work and the only file where the target idiom already sits beside the one being replaced.

| File | `mkdtempSync` calls | Shape |
| --- | --- | --- |
| `test/cli.test.js` | 30 | mixed: inline `try`/`finally`, plus `makeTempDir` in the docs-layout-config tests |
| `test/round-guard.test.mjs` | 4 | inline `try`/`finally` per test |
| `test/execute.test.js` | 2 | inline `try`/`finally` per test |
| `test/list-modules.test.js` | 2 | inline `try`/`finally` per test |
| `test/manifest.test.js` | 2 | `tmp()` factory, cleanup at the call site |
| `test/round-context.test.mjs` | 2 | `inTempDirs(fn)` scoped-callback helper |
| `test/review-lint.test.js` | 1 | inline `try`/`finally` per test |
| `test/skill-cli-entry.test.mjs` | 1 | inline `try`/`finally` per test |
| `test/triage-apply.test.mjs` | 1 | inline `try`/`finally` per test |

## Why it matters

The suite carries two implementations of one concept, which `#swe-reuse` calls a bug; `inTempDirs` is the clearest case, a scoped-callback helper doing what `makeTempDir` does in a different idiom.
Nothing leaks, so this is consistency: the cost is a reviewer reading two idioms and the next new test file copying the wrong one, which is how the original debt arose.

## Constraints

- Purely mechanical; no behavior change and no new coverage.
- A converted test that forgets the `t` parameter throws rather than silently leaking, so the migration fails loud.
- Verify as the original fix was verified: count directories for the affected prefixes in `os.tmpdir()` across a full `npm test` and confirm the count is flat; do not tally `mkdtempSync` against `rmSync` per file, since several files call `rmSync` for unrelated fixture teardown.
- A `mkdtempSync` whose directory outlives one test cannot use `makeTempDir` as it stands (`t.after` is per test); check for a shared directory before converting a file.
