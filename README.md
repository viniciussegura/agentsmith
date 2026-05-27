# agentsmith

Canonical agent instructions, kept in one place and forged into a project's `AGENTS.md`.

Write your cross-project rules once here; generate an inlined `AGENTS.md` in any repo instead of copy-pasting rules into each one.

## Why a generator (not `@`-imports)

`@file` imports are a Claude Code feature; Codex, Cursor, Gemini, and others ignore them.
agentsmith **inlines** every rule into plain text, so the output works in every tool with no import magic and no relative-path resolution to get wrong.
Runtime token cost is the same either way -- imports get expanded into context anyway -- so this trades nothing for portability.

## Usage

Run in the target project.
By default it writes a lean core to `.agentsmith/AGENTS.md`, one file per on-demand bundle under `.agentsmith/agents/`, and a root `AGENTS.md` stub pointing at the core (an existing root stub is left untouched):

```bash
npx github:viniciussegura/agentsmith
```

Pin a version for reproducibility:

```bash
npx github:viniciussegura/agentsmith#v0.1.0
```

Flags:

- `--full` -- inline every bundle into one file instead of the lean core plus on-demand split.
- `--root` -- write the core to the project root instead of under `.agentsmith/`.
- `--out <path>` -- write the core to a specific path.
- `--stdout` -- print the core to stdout instead of writing files.

Whether the generated `AGENTS.md` is committed in the consumer repo is the consumer's call -- agentsmith only produces the file.

## Structure

```
instructions/      rule modules (the source of truth)
  main.md          preamble, emitted first
  ai.md code.md git.md swe.md              core modules, always loaded
  front.md ui-guidelines.md backend.md     bundle modules, loaded on demand
manifest.json      preamble, core module order, on-demand bundles, source label
src/generate.js    pure: (preamble, modules, source) -> AGENTS.md text
src/build.js       pure: assembles the lean core, bundle files, and root stub
src/bundles.js     on-demand index + #tag reference-integrity checks
bin/cli.js         reads sources, writes the files
test/              tests for the generator
```

## Editing the rules

- Each rule has a `#tag` (e.g. `#swe-reuse`) usable as a handle in conversation.
- Rules follow their own `#code-markdown` convention: one sentence per line.
- To add an always-loaded rule, drop a `.md` in `instructions/` and add its path to `manifest.json` `modules`.
- To add an on-demand rule, add its file to a bundle's `modules` in `manifest.json` `bundles`, or define a new bundle with `name`, `title`, `when`, and `modules`; the core lists each bundle so the agent loads it when its `when` matches.
- Order in the output follows `manifest.json`.

Set `manifest.json` `source` to your actual repo URL; it appears in the generated file's header.

## Development

```bash
npm test     # node --test
npm run build -- --stdout   # preview the forged AGENTS.md
```
