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
- `--dev` -- **maintainer-only.** Additionally install the authoring tools from `devtools/claude/` (the instruction-review/apply engine + its meta-agents) into `.claude/`. These audit and edit *this repo's* instruction source and cannot run in a consumer project, so they are never shipped by a normal install; this repo's own dogfood install is `node bin/cli.js --dev`. Composes with `--user`; a no-op under `--stdout`.
- `--stdout` -- print the core to stdout instead of writing files (also skips the adapter install).

The adapter install is namespaced and non-destructive: it writes only the adapter's own files (e.g. `.claude/skills/spec-review/`) and never touches the rest of a consumer's `.claude/`.

Whether the generated `AGENTS.md` is committed in the consumer repo is the consumer's call -- agentsmith only produces the file.

**Coexisting with a project instruction file.** A project may ship its own instruction file alongside the generated set; on conflict the project file wins (except the safety baseline). When a project file restates a rule the generated set already owns, reference its `#tag` rather than paraphrasing it -- a paraphrase silently goes stale when the canonical rule is edited.

## Bundled Claude Code tools

Beyond the portable instructions, the Claude adapter ships skills, commands, and subagents that realize the instruction protocols with real sub-agent delegation:

- **Instruction check** (`/instruction-check`) -- the light tier of review: a single-agent, ephemeral pass that grades the current diff against the project's own generated `AGENTS.md` and reports where it violates a rule (every finding cites a real `#tag`). Fast pre-squash-merge gate; sits above `#swe-done` self-review and below the review board. Unlike the board it measures *conformance to the written rules* only, not general correctness/security/design -- reach for `/review-board` when the change is large or high-stakes.
- **Spec auto-review** (`/spec-review`) -- adversarial review rounds that harden a spec before it becomes a plan (`#ai-spec-review`). The third application of the same role-based review engine (`#ai-review-engine`), at spec altitude: a generalist routes to and **converges** a curated fan-out of domain specialists (the `spec_review` lenses in the shared role registry) into one finding ledger, while a zero-dependency `guard.mjs` drives the convergence guard. Specialists run cheap and parallel; the strong model is reserved for the in-loop converge.
- **Code-review board** (`/review-board`, `/review-promote`) -- a role-based review engine (`#ai-review-engine`, `#ai-review-board`): role-specialized reviewer subagents fan out over a diff or the whole repo, findings are verified adversarially, and a PM reduce groups them into epics and writes a prioritized triage report (`triage.md` -- a triage report, deliberately not an `#ai-plan` execution `plan.md`). It maintains a per-machine issue store under `.agentsmith/review-board/` (gitignored, never committed; closed and promoted issues are partitioned, never deleted); per-run reasoning stays ephemeral under `.agentsmith/tmp/`. The board is a triage layer on top of the team's tracker -- `/review-promote` records a human escalating an issue into the real backlog. A zero-dependency, read-only store linter ships alongside (`node .claude/skills/review-board/lint.mjs`) and enforces the store's structural invariants -- ids, status/placement coupling, and `relatedIssues` integrity -- as a CI-ready gate. Non-Claude tools run the same protocol in a degraded mode via `AGENTS.md`.
- **Instruction review** (`/instruction-review`, `/instruction-apply`) -- **authoring-only; not shipped to consumers** (lives under `devtools/claude/`, installed only with `--dev`). The same engine and role registry turned on an instruction set itself (`#ai-instruction-review`): each role audits `instructions/` + the generated `AGENTS.md` through its lens, proposing missing or weak rules. It opens on the ownership coverage lint, verifies each proposal is a real not-already-covered gap, and writes an editable triage worksheet (`.agentsmith/instruction-review/triage.json`, gitignored); the human triages it (by hand or in `npm run triage`) and the separate `/instruction-apply` writes the one committed output -- the decisions log `docs/instruction-rules-decisions.md` -- and adopts accepted rules into `instructions/`. The round proposes only; it never edits instruction sources. These tools operate on the authoring repo's own instruction source, so they are excluded from a consumer install.

## Install as a Claude Code plugin

The shippable Claude tools are also packaged as a Claude Code **plugin**, which gives them an `agentsmith:` namespace, enable/disable/uninstall, and a version-aware update channel -- an alternative to the raw `npx` adapter install:

```
/plugin marketplace add viniciussegura/agentsmith
/plugin install agentsmith
```

Commands then surface namespaced -- `/agentsmith:review-board`, `/agentsmith:spec-review`, `/agentsmith:agentsmith-init`. Updates: bump `version` in `package.json`, run `npm run build:plugin`, commit; users run `/plugin marketplace update`.

The plugin `source` is a relative path (`./tools/claude`), so you can test an unmerged branch by adding a **local checkout** as the marketplace -- `/plugin marketplace add /path/to/this/repo` -- no push or merge required; it resolves the files on the checked-out branch.

- **Instructions** are not part of the plugin (they are AI-neutral and project-tailored, not Claude-only static text). A plugin user lays them down by running `/agentsmith:agentsmith-init`, which invokes the generator -- so that command requires Node + `npx` (or a local checkout).
- **Pick one path for tooling.** Installing the tools via *both* `npx` and the plugin double-wires the `Agent` model-enforcement hook (once via `settings.json`, once via the plugin) -- harmless (the hook is idempotent) but redundant. Use the plugin **or** the `npx` adapter install, not both.

## Structure

```
instructions/      rule sections (the portable source of truth)
  main.md          preamble, emitted first
  core/            ai.md code.md git.md swe.md   always-loaded modules
  frontend/        front.md ui-guidelines.md     on-demand bundle
  backend/         backend.md                    on-demand bundle
  ownership.yaml   #tag -> owner map             repo config; NEVER exported
  roles.yaml       review-role metadata          repo config; NEVER exported
tools/             tool-specific adapters, installed into .<ai>/ (shipped to consumers)
  claude/          agents/ skills/ commands/ hooks/   Claude Code adapter (-> .claude/)
    .claude-plugin/plugin.json                        generated plugin manifest
devtools/          maintainer-only dev tooling, never shipped to consumers
  claude/          authoring adapters (instruction-review/apply) installed only with --dev
  triage-ui/       the instruction-review triage server + apply engine
.claude-plugin/marketplace.json   generated single-plugin marketplace (git-subdir -> tools/claude)
manifest.json      preamble, ordered sections (folder + optional when/title), source label
src/generate.js    pure: (preamble, modules, source) -> AGENTS.md text
src/build.js       pure: assembles the lean core, bundle files, and root stub
src/sections.js    pure: splits manifest sections into core vs on-demand bundles
src/bundles.js     on-demand index + #tag reference-integrity + ownership coverage lint
src/tools.js       pure: maps tools/<ai>/** and devtools/claude/** to .<ai>/** install paths
bin/cli.js         reads sources, writes the files
bin/build-plugin.js  generates plugin.json + marketplace.json from package.json
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
npm test               # node --test
npm run build -- --stdout   # preview the forged AGENTS.md
npm run build:plugin   # regenerate the plugin.json + marketplace.json manifests
node bin/cli.js --dev  # dogfood install, including the authoring tools
```
