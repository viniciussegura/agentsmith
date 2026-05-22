# agentsmith

Canonical agent instructions, kept in one place and forged into a project's `AGENTS.md`.

Write your cross-project rules once here; generate an inlined `AGENTS.md` in any repo instead of copy-pasting rules into each one.

## Why a generator (not `@`-imports)

`@file` imports are a Claude Code feature; Codex, Cursor, Gemini, and others ignore them.
agentsmith **inlines** every rule into plain text, so the output works in every tool with no import magic and no relative-path resolution to get wrong.
Runtime token cost is the same either way — imports get expanded into context anyway — so this trades nothing for portability.

## Usage

Run in the target project; it writes `AGENTS.md` into the current directory:

```bash
npx github:viniciussegura/agentsmith
```

Pin a version for reproducibility:

```bash
npx github:viniciussegura/agentsmith#v0.1.0
```

Flags:

- `--out <path>` — write somewhere other than `AGENTS.md`.
- `--stdout` — print to stdout instead of writing a file.

Whether the generated `AGENTS.md` is committed in the consumer repo is the consumer's call — agentsmith only produces the file.

## Structure

```
instructions/      rule modules (the source of truth)
  main.md          preamble, emitted first
  git.md swe.md code.md ai.md
manifest.json      preamble + module order + output name + source label
src/generate.js    pure: (preamble, modules, source) -> AGENTS.md text
bin/cli.js         reads sources, writes the file
test/              tests for the generator
```

## Editing the rules

- Each rule has a `#tag` (e.g. `#git-workflow`) usable as a handle in conversation.
- Rules follow their own `#code-markdown` convention: one sentence per line.
- To add a module, drop a `.md` in `instructions/` and add its path to `manifest.json` `modules`.
- Order in the output follows `manifest.json`.

Set `manifest.json` `source` to your actual repo URL; it appears in the generated file's header.

## Development

```bash
npm test     # node --test
npm run build -- --stdout   # preview the forged AGENTS.md
```
