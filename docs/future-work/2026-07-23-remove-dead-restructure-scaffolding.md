# Remove dead `devtools/restructure/` migration scaffolding

Recorded 2026-07-23, during the CLI subcommand redesign.

## What

`devtools/restructure/gate.mjs` is a one-off content-equivalence gate from the earlier instruction-onefile-restructure work.
It compares generated output against a reference snapshot under `.agentsmith/tmp/restructure/ref1` -- a gitignored path that no longer exists -- so the gate cannot run.
It is not wired to `npm test` and has no live caller; its path appears only as fixture data in `test/tools.test.js` and `test/triage-export.test.mjs` (asserting the directory is never installed/packed).

## Why it matters now

The CLI redesign removed the `--full` flag and made a bare `node bin/cli.js` invocation error (verb required).
`gate.mjs` still calls `run(['--full', '--stdout'])` and `run([])`, so it is now doubly stale.
It is dead, not a regression -- nothing executes it -- so it was left out of the redesign's fix wave rather than deleted mid-branch.

## Proposed action

Delete `devtools/restructure/` in a small follow-up branch.
Update the two tests that reference `devtools/restructure/...` as illustrative fixture paths to use a still-representative dev-only path (or a synthetic one), keeping the "devtools non-`claude` dirs are never installed/packed" assertions intact.

## Constraints

Purely a cleanup; no behavior change.
Verify `npm test` stays green and `npm pack --dry-run` still excludes `devtools/`.
