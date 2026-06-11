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
- `--user` -- set up agentsmith for all projects: write the instructions to `~/.agentsmith/AGENTS.md`, install the tool adapters into `~/.<ai>/` (e.g. `~/.claude/`), and add an `@`-import of the home instructions to `~/.claude/CLAUDE.md` (appended only if absent; your other content is left untouched). If you previously imported a local checkout's `AGENTS.md`, remove that stale line.
- `--stdout` -- print the core to stdout instead of writing files (also skips the adapter install).

The adapter install is namespaced and non-destructive: it writes only the adapter's own files (e.g. `.claude/skills/spec-review/`) and never touches the rest of a consumer's `.claude/`.

Whether the generated `AGENTS.md` is committed in the consumer repo is the consumer's call -- agentsmith only produces the file.

## Bundled Claude Code tools

Beyond the portable instructions, the Claude adapter ships skills, commands, and subagents that realize the instruction protocols with real sub-agent delegation:

- **Spec auto-review** (`/spec-review`) -- adversarial review rounds that harden a spec before it becomes a plan (`#ai-spec-review`).
- **Code-review board** (`/review-board`, `/review-promote`) -- a role-based review engine (`#ai-review-engine`, `#ai-review-board`): role-specialized reviewer subagents fan out over a diff or the whole repo, findings are verified adversarially, and a PM reduce groups them into epics and writes a prioritized triage report (`triage.md` -- a triage report, deliberately not an `#ai-plan` execution `plan.md`). It maintains a committed, human-readable issue store under `reviews/` in the consumer repo (closed and promoted issues are partitioned, never deleted); per-run reasoning stays ephemeral under `.agentsmith/tmp/`. The board is a triage layer on top of the team's tracker -- `/review-promote` records a human escalating an issue into the real backlog. A zero-dependency, read-only store linter ships alongside (`node .claude/skills/review-board/lint.mjs`) and enforces the store's structural invariants -- ids, status/placement coupling, and `relatedIssues` integrity -- as a CI-ready gate. Non-Claude tools run the same protocol in a degraded mode via `AGENTS.md`.
- **Instruction review** (`/instruction-review`) -- the same engine and role registry turned on an instruction set itself (`#ai-instruction-review`): each role audits `instructions/` + the generated `AGENTS.md` through its lens, proposing missing or weak rules. It opens on the ownership coverage lint, verifies each proposal is a real not-already-covered gap, and rolls the backlog `docs/future-work/proposed-instruction-rules.md` -- proposing only, never editing instruction sources.

## Structure

```
instructions/      rule sections (the portable source of truth)
  main.md          preamble, emitted first
  core/            ai.md code.md git.md swe.md   always-loaded modules
  frontend/        front.md ui-guidelines.md     on-demand bundle
  backend/         backend.md                    on-demand bundle
  ownership.yaml   #tag -> owner map             repo config; NEVER exported
  roles.yaml       review-role metadata          repo config; NEVER exported
tools/             tool-specific adapters, installed into .<ai>/
  claude/          agents/ skills/ commands/     Claude Code adapter (-> .claude/)
manifest.json      preamble, ordered sections (folder + optional when/title), source label
src/generate.js    pure: (preamble, modules, source) -> AGENTS.md text
src/build.js       pure: assembles the lean core, bundle files, and root stub
src/sections.js    pure: splits manifest sections into core vs on-demand bundles
src/bundles.js     on-demand index + #tag reference-integrity + ownership coverage lint
src/tools.js       pure: maps tools/<ai>/** to .<ai>/** install paths
bin/cli.js         reads sources, writes the files
test/              tests for the generator
```

## Editing the rules

- Each rule has a `#tag` (e.g. `#swe-reuse`) usable as a handle in conversation.
- Rules follow their own `#code-markdown` convention: one sentence per line.
- To add a rule, drop a `.md` into a section folder under `instructions/` (e.g. `core/` or `backend/`); it is picked up automatically.
- Every `#tag` has exactly one owner (a review role, the `swe` base lens, or the `process` non-review marker) in `instructions/ownership.yaml`; adding a rule means adding its one owner row, or `npm test`'s coverage lint fails on the orphan. Role metadata lives in `instructions/roles.yaml`; both are repo config and are never exported.
- To add a section, create a folder under `instructions/` and add an entry to `manifest.json` `sections`: a `name` (the folder) plus, for an on-demand bundle, a `title` and a `when`; a section with no `when` is always-loaded and inlined into the core.
- Files in a section load alphabetically; set a section's `modules` to an explicit file list to override that order.
- Section order in the output follows `manifest.json`.

Set `manifest.json` `source` to your actual repo URL; it appears in the generated file's header.

## Development

```bash
npm test     # node --test
npm run build -- --stdout   # preview the forged AGENTS.md
```
