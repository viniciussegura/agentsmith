# Three test files create temp directories and never remove them

Date: 2026-08-11

## The debt

Three test files call `mkdtempSync` per test and never delete the result, so every `npm test` run leaves 49 directories behind in `os.tmpdir()` permanently.

| File | Prefix | Dirs per run |
| --- | --- | --- |
| `test/spec-review-guard.test.js:9` | `sr-guard-` | 23 |
| `test/review-persist.test.js:10` (`scaffold()`) | `rb-` | 13 |
| `test/triage-server.test.mjs:31` (`tmpTriage()`) | `triage-` | 13 |

Counts measured by running each file and diffing the temp directory, not inferred from test counts.

The repo's other nine `mkdtempSync` users all clean up in a `finally`, so this is an inconsistency within the suite rather than a missing convention.

## Why accepted for now

Pre-existing on `main` and orthogonal to the branch that surfaced it (`fix/board-driver-bugs-and-plan-scope`, a review-board driver fix), which is the #swe-technical-debts split: record at the moment it is incurred, remediate as its own unit.

The fix is mechanical but not one-line -- it touches every test in three files -- so it meets #ai-plan's non-trivial bar and wants its own spec rather than a drive-by commit on an unrelated PR.

## Cost / risk

Low per run, unbounded over time. Nothing fails and no test is wrong; the directories are empty scaffolding that accumulates invisibly.

Two ways it bites:

- A long-lived developer machine accumulates thousands of entries in one directory. Enumeration of `os.tmpdir()` slows measurably on Windows, which affects unrelated tooling rather than this repo.
- A CI runner with a small temp partition (or one that reuses a workspace across jobs) can fill it. This repo has **no CI today**, so that risk is latent rather than live.

It is also a #swe-test-quality miss: a test that leaves state behind is not isolated, even though nothing here reads that state back.

## Remediation sketch

Wrap each body in `try`/`finally` with `rmSync(dir, { recursive: true, force: true })`, or hand the directory to a helper that does it -- the shape already used in `test/round-context.test.mjs` (`inTempDirs`), `test/round-guard.test.mjs`, and `test/skill-cli-entry.test.mjs`.

Two notes for whoever picks it up:

- `tmpTriage()` returns a **file path inside** the directory and discards the directory reference, so it must return or close over both before the cleanup has anything to delete. The other two return the directory already.
- Do not audit this by tallying `mkdtempSync` against `rmSync` per file. `triage-server.test.mjs` scores as clean that way: its only `rmSync` occurrence is the import on line 3, never a call.

Clearing the already-accumulated directories is a separate, one-off operation on each affected machine -- scoped to the three prefixes above, never a wholesale wipe of `os.tmpdir()`, which holds unrelated entries.
