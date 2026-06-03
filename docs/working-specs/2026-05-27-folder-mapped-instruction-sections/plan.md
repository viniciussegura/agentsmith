# Plan: Folder-mapped instruction sections

Date: 2026-05-27
Status: Implemented

Implements [the spec](../specs/2026-05-27-folder-mapped-instruction-sections.md).
Decisions locked: `main.md` stays at root as `preamble`; alphabetical glob + optional `modules` override; unified `sections[]` with optional `when`; `build.js`/`generate.js` stay pure and unchanged, the split lives in `cli.js`.

## Task 0 -- Capture the baseline (output-neutrality gate)

Before moving anything, record the current generated output so the end-state can be proven byte-identical save the header hash.

- Save `node bin/cli.js --stdout` to a temp file.
- Save the two bundle files (`.agentsmith/agents/frontend.md`, `backend.md`) to temp.
- These are the diff targets for Task 7.

## Task 1 -- Pure `resolveSections` helper, test-first

New `src/sections.js`, kept pure by injecting the directory lister.

- `test/sections.test.js`: given `sections` plus a stub `listFiles(name) -> paths`, assert that
  - sections with no `when` contribute their files to `core` in `sections` order;
  - sections with a `when` become `bundles` entries carrying `name`, `title`, `when`, and resolved `modules` paths;
  - a section's explicit `modules` overrides `listFiles`;
  - section order is preserved.
- Implement `resolveSections({ sections, listFiles }) -> { coreModulePaths, bundles: [{ name, title, when, modulePaths }] }` to pass.

## Task 2 -- Move instruction files into section folders

`git mv` so history follows:

- `instructions/{ai,code,git,swe}.md` -> `instructions/core/`
- `instructions/{front,ui-guidelines}.md` -> `instructions/frontend/`
- `instructions/backend.md` -> `instructions/backend/`
- `instructions/main.md` stays put.

## Task 3 -- Rewrite `manifest.json`

Replace `modules` + `bundles` with the unified `sections` list:
`core` (no `when`), then `frontend` and `backend` (each with `title` + `when`).
Keep `preamble`, `source`, `output`.

## Task 4 -- Wire `cli.js` to the folder model

- Add `listFiles(name)`: `readdirSync(instructions/<name>)`, keep `*.md`, `.sort()` (code-unit, deterministic), return package-relative paths.
- Call `resolveSections({ sections: manifest.sections, listFiles })`.
- Read contents for `coreModulePaths` and each bundle's `modulePaths`.
- Call `buildOutputs` with the existing shape: `{ preamble, modules: coreContents, bundles: [{ name, title, when, modules: contents }], ... }`.
- Leave `--full`, `--root`, `--out`, `--stdout`, and the dangling/cross-boundary warnings as they are.

## Task 5 -- cli-level tests

- Add coverage: a temp `instructions/` tree with section folders generates core + bundles in sorted order; an explicit `modules` override reorders; a `when`-absent section inlines into core while a `when` section emits a bundle + index line.
- Update any existing `cli` test that hard-codes the old `modules`/`bundles` manifest shape.

## Task 6 -- Docs

- `README.md`: Structure shows the folders; Editing describes adding a file to a section folder and adding a section to `sections`.
- `prompts/review-instructions.md`: reword the lean-split dimension from "modules" to "sections/folders"; the "read every file under `instructions/`" line still holds.

## Task 7 -- Verify output-neutral, then full suite

- Regenerate; diff against the Task 0 baseline.
- The only allowed difference is the header revision hash.
- Run `npm test` -- all green, including the new `sections` and cli coverage.

## Task 8 -- Commit

- One commit (the branch squashes at merge): the file moves, manifest, cli, new helper + tests, and docs.
- Conventional Commit, AI-prefixed, with the `Usage:` trailer.
