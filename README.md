# agentsmith

Best-practice software-engineering instructions for AI agents — written once,
generated into any repo. Portable `AGENTS.md` is the default output; where a tool
supports them (e.g. Claude Code), skills, commands, and subagents are installed
alongside.

Cross-project rules live in one well-tended source here instead of being
copy-pasted between projects. agentsmith **inlines** them into a plain `AGENTS.md`
that every agent reads, and additively installs tool-specific adapters.

## Why a generator (not `@`-imports)

`@file` imports are a Claude Code feature; Codex, Cursor, Gemini, and others
ignore them. agentsmith inlines every rule into plain text, so the output works
in every tool with no import magic and no relative-path resolution to get wrong.
Runtime token cost is the same either way — imports get expanded into context
anyway — so this trades nothing for portability.

## Usage

Run in the target project:

```bash
npx github:viniciussegura/agentsmith          # latest
npx github:viniciussegura/agentsmith#v0.1.0   # pinned, reproducible
```

By default it writes a lean core to `.agentsmith/AGENTS.md`, one file per
on-demand bundle under `.agentsmith/agents/`, a root `AGENTS.md` stub pointing at
the core (an existing stub is left untouched), and installs the tool adapters
(e.g. `tools/claude/` into `.claude/`). Whether you commit the generated
`AGENTS.md` is your call — agentsmith only produces the file.

Flags:

- `--full` — inline every bundle into one file instead of the lean core plus on-demand split.
- `--root` — write the core to the project root instead of under `.agentsmith/`.
- `--out <path>` — write the core to a specific path.
- `--no-tools` — skip installing the tool adapters.
- `--user` — set up agentsmith for all projects: write instructions to `~/.agentsmith/AGENTS.md`, install adapters into `~/.<ai>/`, and `@`-import the home instructions from `~/.claude/CLAUDE.md` (appended only if absent).
- `--stdout` — print the core to stdout instead of writing files.

The adapter install is non-destructive: it writes only the adapter's own files
(e.g. `.claude/skills/spec-review-board/`) and never touches the rest of your
`.claude/`.

## Bundled Claude Code tools

Beyond the portable instructions, the Claude adapter ships skills and commands
that realize the instruction protocols with real sub-agent delegation:

- **`/code-review-board`** (+ `/review-promote`) — a role-based review board:
  reviewer subagents fan out over a diff or the whole repo, findings are verified
  adversarially, and a PM reduce writes a prioritized triage report. Keeps a
  per-machine issue store; `/review-promote` escalates an issue into your real
  tracker.
- **`/spec-review-board`** — adversarial review rounds that harden a spec before
  it becomes a plan: a generalist converges a curated fan-out of domain
  specialists until the findings ledger is clean.
- **`/instruction-check`** — a single-agent, fast pass that grades the current
  diff against the project's own generated `AGENTS.md` and reports rule
  violations. The light tier; reach for `/code-review-board` on larger changes.
- **`/spec-index`** — regenerate (or `--check`) the working-specs index for a
  project that adopts the `#ai-plan` spec workflow.

The instruction-review / -apply engine that audits and edits the rule set itself
is **authoring-only** (installed with `--dev`); see [CONTRIBUTING.md](CONTRIBUTING.md).
Non-Claude tools run the same protocols in a degraded mode straight from
`AGENTS.md`.

After an `npx` adapter install, commands surface as `/agentsmith-<name>` (a
hyphen prefix, so they cannot collide with a built-in or another plugin); the
plugin install (below) namespaces them as `/agentsmith:<name>`.

## Install as a Claude Code plugin

The shippable Claude tools are also packaged as a Claude Code **plugin** — an
`agentsmith:` namespace, enable/disable/uninstall, and a version-aware update
channel, as an alternative to the raw `npx` adapter install:

```
/plugin marketplace add viniciussegura/agentsmith
/plugin install agentsmith
```

Commands then surface as `/agentsmith:code-review-board`,
`/agentsmith:spec-review-board`, and so on.

- **Instructions are not part of the plugin** (they are AI-neutral and
  project-tailored, not Claude-only static text). A plugin user lays them down by
  running `/agentsmith:agentsmith-init`, which invokes the generator — so that
  command needs Node + `npx` (or a local checkout).
- **Pick one path for tooling.** Installing via *both* `npx` and the plugin
  double-wires the `Agent` model-enforcement hook (harmless — it is idempotent —
  but redundant). Use the plugin **or** the `npx` adapter install, not both.

## Contributing

Working on the rules or the generator? See [CONTRIBUTING.md](CONTRIBUTING.md) for
the repository layout, how to author rules, and the dev workflow. How this repo
organizes its specs, decisions, and history is in
[docs/documentation-model.md](docs/documentation-model.md).
