# agentsmith

Forges the tooling for best software-engineering practice with AI agents -- portable instructions first, and, where a tool supports them, skills, commands, and subagents.

The inlined `AGENTS.md` is the default output, not the only one: cross-project rules are written once here and generated into any repo instead of being copy-pasted, and tool-specific adapters (e.g. for Claude Code) are installed alongside them.
Portability is the default; tool-specific artifacts are additive.

## Why a generator (not `@`-imports)

`@file` imports are a Claude Code feature; Codex, Cursor, Gemini, and others ignore them.
agentsmith **inlines** every rule into plain text, so the output works in every tool with no import magic and no relative-path resolution to get wrong.
Runtime token cost is the same either way -- imports get expanded into context anyway -- so this trades nothing for portability.

## Usage

Run in the target project.
By default it writes a lean core to `.agentsmith/AGENTS.md`, one file per on-demand bundle under `.agentsmith/agents/`, a root `AGENTS.md` stub pointing at the core (an existing root stub is left untouched), and installs the tool adapters under `tools/<ai>/` into their runtime locations (e.g. `tools/claude/` into `.claude/`):

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
- `--no-tools` -- skip installing the tool adapters (`tools/<ai>/` into `.<ai>/`).
- `--stdout` -- print the core to stdout instead of writing files (also skips the adapter install).

The adapter install is namespaced and non-destructive: it writes only the adapter's own files (e.g. `.claude/skills/spec-review/`) and never touches the rest of a consumer's `.claude/`.

Whether the generated `AGENTS.md` is committed in the consumer repo is the consumer's call -- agentsmith only produces the file.

## Structure

```
instructions/      rule sections (the portable source of truth)
  main.md          preamble, emitted first
  core/            ai.md code.md git.md swe.md   always-loaded modules
  frontend/        front.md ui-guidelines.md     on-demand bundle
  backend/         backend.md                    on-demand bundle
tools/             tool-specific adapters, installed into .<ai>/
  claude/          agents/ skills/ commands/     Claude Code adapter (-> .claude/)
manifest.json      preamble, ordered sections (folder + optional when/title), source label
src/generate.js    pure: (preamble, modules, source) -> AGENTS.md text
src/build.js       pure: assembles the lean core, bundle files, and root stub
src/sections.js    pure: splits manifest sections into core vs on-demand bundles
src/bundles.js     on-demand index + #tag reference-integrity checks
src/tools.js       pure: maps tools/<ai>/** to .<ai>/** install paths
bin/cli.js         reads sources, writes the files
test/              tests for the generator
```

## Editing the rules

- Each rule has a `#tag` (e.g. `#swe-reuse`) usable as a handle in conversation.
- Rules follow their own `#code-markdown` convention: one sentence per line.
- To add a rule, drop a `.md` into a section folder under `instructions/` (e.g. `core/` or `backend/`); it is picked up automatically.
- To add a section, create a folder under `instructions/` and add an entry to `manifest.json` `sections`: a `name` (the folder) plus, for an on-demand bundle, a `title` and a `when`; a section with no `when` is always-loaded and inlined into the core.
- Files in a section load alphabetically; set a section's `modules` to an explicit file list to override that order.
- Section order in the output follows `manifest.json`.

Set `manifest.json` `source` to your actual repo URL; it appears in the generated file's header.

## Development

```bash
npm test     # node --test
npm run build -- --stdout   # preview the forged AGENTS.md
```
