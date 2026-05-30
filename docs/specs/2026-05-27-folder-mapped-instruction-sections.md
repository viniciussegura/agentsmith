# Spec: Folder-mapped instruction sections

Status: draft, awaiting approval.
Date: 2026-05-27.

## Problem

`manifest.json` declares every section by an explicit file list: `modules` for the core and a `modules` array inside each entry of `bundles`.
This duplicates structure that the filesystem could express, and it splits one concept (an ordered group of rule files) across two differently-shaped manifest fields (`modules` vs `bundles`).
Adding a rule means editing the manifest as well as adding the file.

## Decisions (locked)

1. `main.md` stays at `instructions/main.md` and keeps its dedicated `preamble` field; it is not a module and is never globbed.
2. Files in a section load in alphabetical order, with an optional `modules` array on the section to override order when semantic order differs from alphabetical.
3. Core and bundles unify into one ordered `sections` list; each section may carry an optional `when`.
   A section with no `when` is always-loaded and inlined into the core output; a section with a `when` becomes an on-demand bundle file plus an index entry.

## File layout

```
instructions/
  main.md                       preamble (unchanged location and role)
  core/
    ai.md  code.md  git.md  swe.md
  frontend/
    front.md  ui-guidelines.md
  backend/
    backend.md
```

A section's name is its folder name under `instructions/`.

## Manifest schema

Before:

```json
{
  "source": "...",
  "preamble": "instructions/main.md",
  "modules": ["instructions/ai.md", "instructions/code.md", "instructions/git.md", "instructions/swe.md"],
  "bundles": [
    { "name": "frontend", "title": "Front-end instructions", "when": "Front-end or UI work",
      "modules": ["instructions/front.md", "instructions/ui-guidelines.md"] },
    { "name": "backend", "title": "Back-end instructions", "when": "Back-end, API, or service work",
      "modules": ["instructions/backend.md"] }
  ],
  "output": "AGENTS.md"
}
```

After:

```json
{
  "source": "...",
  "preamble": "instructions/main.md",
  "sections": [
    { "name": "core" },
    { "name": "frontend", "title": "Front-end instructions", "when": "Front-end or UI work" },
    { "name": "backend", "title": "Back-end instructions", "when": "Back-end, API, or service work" }
  ],
  "output": "AGENTS.md"
}
```

Section fields:

- `name` (required): folder under `instructions/`; supplies the files and the bundle filename.
- `when` (optional): trigger text for the on-demand index; its presence makes the section a bundle.
- `title` (optional): H1 of the bundle file; ignored for always-loaded sections, whose files self-title via their own H1.
- `modules` (optional): explicit ordered file list that overrides the alphabetical glob for that section.

## Loading rules

- Files for a section are every `*.md` directly under `instructions/<name>/`, sorted by default (code-unit) order for cross-platform determinism.
- If a section provides `modules`, that list is used verbatim instead of globbing; paths are relative to the package root.
- Always-loaded sections (no `when`) are concatenated into the core output in `sections` order, files within a section in resolved order.
- Bundle sections (with `when`) each emit one file under `.agentsmith/agents/<name>.md` and one on-demand index line, in `sections` order.

## Output equivalence guarantee

Today's emit order is already alphabetical (`ai, code, git, swe` and `front, ui-guidelines`), so the migration must be byte-for-byte output-neutral.
Acceptance test: capture `node bin/cli.js --stdout` and the bundle files before the change, perform the change, regenerate, and diff -- the only allowed difference is the source-revision hash in the header.

## Implementation surface

- `manifest.json`: replace `modules` + `bundles` with `sections`.
- `instructions/`: `git mv` the four core files into `core/`, the two front files into `frontend/`, and `backend.md` into `backend/`.
- `bin/cli.js`: resolve each section's files (glob the folder and sort, or use `modules`), read contents, split sections into always-loaded (core) and on-demand (bundle), then call `buildOutputs` with the same `modules` + `bundles` shape it accepts today.
- `src/build.js` and `src/generate.js`: unchanged; they stay pure string assemblers, and the core/bundle split is computed in `cli.js`.
- `test/`: `generate` and `build` suites unchanged; add `cli`-level tests for folder globbing, the `modules` override, and the `when`-absent core split; update any existing `cli` test that hard-codes the old manifest shape.
- `README.md`: update Structure and Editing to describe folders and `sections`.
- `prompts/review-instructions.md`: reword the lean-split dimension from "modules" to "sections/folders"; the "read every file under `instructions/`" instruction still holds.

## Edge cases

- A section folder with no `*.md` contributes nothing; the build warns rather than failing.
- Non-`.md` files in a section folder are ignored.
- A section with both `when` and no files still emits an (empty) bundle and index line; warn.
- `--full` layout inlines every section regardless of `when`, exactly as today.

## Out of scope

- Numeric filename prefixes for ordering (the optional `modules` override covers the rare case).
- Nested section folders (sections are one level deep under `instructions/`).
- Any change to rule content or to the generated output beyond the header hash.

## Acceptance criteria

1. Generated core and bundle files are byte-identical to the pre-change output except for the header revision hash.
2. `manifest.json` no longer contains any `modules` except as an optional per-section override.
3. The full test suite passes, including new cli-level coverage for globbing, override, and the `when`-absent split.
4. `README.md` and `prompts/review-instructions.md` reflect the folder model.
