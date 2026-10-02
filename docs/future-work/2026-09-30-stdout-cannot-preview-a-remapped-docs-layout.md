# `--stdout` cannot preview a remapped docs layout

Date: 2026-09-30

## What it is

`agentsmith --stdout` reads no `.agentsmith/docs-layout.yaml`, so it always prints the default `#swe-docs-layout` table. A project that has remapped a row cannot see the emitted result through the one command whose whole purpose is to show the emitted set without touching disk.

The exclusion is deliberate rather than an oversight. `--stdout` is a pure generate-and-print query with no scope axis to read a config against (`docs/reference-spec/cli.md`), and several in-repo consumers invoke it from this repository's own root -- the plugin build, the instruction-integrity test, the triage UI server and apply engine, the restructure gate, and the review-instructions prompt. Reading a config there would let agentsmith's own layout config change the plugin build and the integrity test's subject.

## Why it matters

Two previews already exist -- `agentsmith install --dry-run`, and reading the installed `.agentsmith/AGENTS.md` -- so the gap is ergonomic, not a correctness hole. What it costs is the tightest feedback loop for the person authoring a config: they see the emitted table only by building an install plan or by having already installed, which is the loop `--stdout` exists to shorten for every other question about the output.

## Constraints and dependencies

- `parseArgs` must keep its shape. `--stdout` returns `{ kind: 'stdout', flags: { mode } }` with no scope field and rejects every scope flag; `test/args.test.js` pins that, and `docs/reference-spec/cli.md` documents it as current truth.
- The in-repo consumers above must stay unaffected. Any preview path has to be opt-in and off by default, or this repo's own config silently becomes an input to its plugin build and its integrity test -- the failure the exclusion was chosen to prevent.
- The likeliest shape is therefore an explicit opt-in on the query -- a flag naming the directory whose config to read -- which keeps the default output byte-identical and makes the preview's input visible in the invocation rather than implied by the working directory.
- A new flag is public surface (`#swe-public-surface-docs`) and needs its docs in the same change.
