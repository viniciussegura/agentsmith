# Remove dead `devtools/restructure/` migration scaffolding

## What

`devtools/restructure/gate.mjs` is a one-off content-equivalence gate from the instruction-onefile-restructure work.
It compares generated output against a reference snapshot under `.agentsmith/tmp/restructure/ref1`, a gitignored path that no longer exists, so it cannot run; it is not wired to `npm test` and has no live caller, and its path appears only as fixture data in `test/tools.test.js` and `test/triage-export.test.mjs`, asserting the directory is never installed or packed.
Delete `devtools/restructure/` and repoint the two tests at a still-representative dev-only path, keeping their "non-`claude` devtools are never installed or packed" assertions intact.

## Why it matters

The CLI redesign removed the `--full` flag and made a bare `node bin/cli.js` invocation an error, and `gate.mjs` still calls both, so it is doubly stale: dead code a reader has to work out is dead (`#swe-dead-code`).

## Constraints

- Purely a cleanup; no behavior change.
- `npm test` stays green and `npm pack --dry-run` still excludes `devtools/`.
