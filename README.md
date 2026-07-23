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
npx github:viniciussegura/agentsmith install          # latest
npx github:viniciussegura/agentsmith#v0.1.0 install    # pinned, reproducible
```

agentsmith is a verb-first CLI: `install`, `uninstall`, and `spec-index` are subcommands; `--stdout`, `--help`, and `--version` are top-level query flags.
Bare `agentsmith` (no verb) opens an interactive wizard on a TTY, or errors off one.
Full flag reference, the confirmation gate, and plugin-coexistence detail live in [`docs/reference-spec/cli.md`](docs/reference-spec/cli.md); this section is a summary.

By default `install` writes a lean core to `.agentsmith/AGENTS.md`, one file per on-demand bundle under `.agentsmith/agents/`, a root `AGENTS.md` stub pointing at the core (an existing stub is left untouched), and installs the tool adapters (e.g. `tools/claude/` into `.claude/`).
Whether you commit the generated `AGENTS.md` is your call — agentsmith only produces the file.
Before writing anything, it prints the intended-effects plan and, on a TTY without `--yes`, asks for confirmation.

```bash
agentsmith install                    # project scope, default mode/placement
agentsmith install --scope user       # ~/.agentsmith/AGENTS.md + ~/.<ai>/ adapters
agentsmith install --mode single      # one inlined file instead of lean core + bundles
agentsmith install --placement root   # core at ./AGENTS.md instead of nested
agentsmith install --no-tools         # instructions only, skip tool adapters
agentsmith install --clean --yes      # uninstall then reinstall this scope, no prompt
```

`agentsmith uninstall` reverses an `install` of the same scope: it deletes
every path agentsmith wrote (from its install manifest), un-merges the hook
entry from `settings.json`, and removes the marked `CLAUDE.md` import
(`--scope user`). `uninstall` and `install --clean` are **destructive**: off a
TTY they refuse to run without `--yes`.

```bash
agentsmith uninstall
agentsmith uninstall --scope user --yes
```

`agentsmith --stdout` generates the core content and prints it — it writes
nothing and takes no scope or disk flags:

```bash
agentsmith --stdout
agentsmith --stdout --mode single
```

The adapter install is non-destructive: it writes only the adapter's own files
(e.g. `.claude/skills/spec-review-board/`) and never touches the rest of your
`.claude/`.

**Coexisting with a project instruction file.** A project may ship its own instruction file alongside the generated set; on conflict the project file wins (except the safety baseline). When a project file restates a rule the generated set already owns, reference its `#tag` rather than paraphrasing it -- a paraphrase silently goes stale when the canonical rule is edited.

**Coexisting with the Claude Code plugin.** Running the CLI install alongside
`/plugin install agentsmith` (below) duplicates every skill/agent/command under
`.claude/`. Install with `agentsmith install --no-tools` (instructions only) to
run the CLI beside the plugin without that duplication — see
[`docs/reference-spec/cli.md`](docs/reference-spec/cli.md#plugin-coexistence)
for the full guarantee.

## Bundled Claude Code tools

Beyond the portable instructions, the Claude adapter ships skills and commands
that realize the instruction protocols with real subagent delegation:

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

```text
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
[docs/reference-spec/documentation-model.md](docs/reference-spec/documentation-model.md); the review-board round
protocol is in [docs/reference-spec/review-board-protocol.md](docs/reference-spec/review-board-protocol.md).
