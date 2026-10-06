# `--stdout` cannot preview a remapped docs layout

## What

`agentsmith --stdout` reads no `.agentsmith/docs-layout.yaml`, so it always prints the default `#swe-docs-layout` table, and a project that has remapped a row cannot see the emitted result through the one command whose purpose is to show the emitted set without touching disk.
The exclusion is deliberate: `--stdout` is a pure generate-and-print query with no scope axis to read a config against (`docs/reference-spec/cli.md`), and several in-repo consumers invoke it from this repository's own root (the plugin build, the instruction-integrity test, the triage UI server and apply engine, the review-instructions prompt), so reading a config there would let agentsmith's own layout config change the plugin build and the integrity test's subject.
The likeliest shape is an explicit opt-in on the query, a flag naming the directory whose config to read, which keeps the default output byte-identical and makes the preview's input visible in the invocation.

## Why it matters

Two previews exist, `agentsmith install --dry-run` and reading the installed `.agentsmith/AGENTS.md`, so the gap is ergonomic: the person authoring a config sees the emitted table only by building an install plan or by having already installed, which is the loop `--stdout` exists to shorten for every other question about the output.

## Constraints

- `parseArgs` keeps its shape: `--stdout` returns `{ kind: 'stdout', flags: { mode } }` with no scope field and rejects every scope flag; `test/args.test.js` pins that and `cli.md` documents it.
- The in-repo consumers stay unaffected: any preview path is opt-in and off by default.
- A new flag is public surface (`#swe-public-surface-docs`) and needs its docs in the same change.
