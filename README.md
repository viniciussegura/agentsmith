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

agentsmith is a verb-first CLI: `install` and `uninstall` are subcommands; `--stdout`, `--help`, and `--version` are top-level query flags.
Bare `agentsmith` (no verb) opens an interactive wizard on a TTY, or errors off one.
Full flag reference, the confirmation gate, and plugin-coexistence detail live in [`docs/reference-spec/cli.md`](docs/reference-spec/cli.md); this section is a summary.

To put the `agentsmith` binary on `PATH` -- so the examples below run without the `npx github:…` prefix and its per-call permission prompt -- install it globally once:

```bash
npm install -g github:viniciussegura/agentsmith
```

This is the recommended setup for repeated use, and for running agentsmith from an agent.
A plugin-only install ships the commands but not the binary; its `npx` fallback is documented in [`docs/reference-spec/cli.md`](docs/reference-spec/cli.md).

By default `install` writes a lean core to `.agentsmith/AGENTS.md`, one file per on-demand bundle under `.agentsmith/agents/`, a root `AGENTS.md` stub pointing at the core (an existing stub is left untouched), and installs the tool adapters (e.g. `tools/claude/` into `.claude/`).
Whether you commit the generated `AGENTS.md` is your call — agentsmith only produces the file.
Before writing anything, it prints the intended-effects plan and, on a TTY without `--yes`, asks for confirmation.

**Gitignore the working state.** `install` does not modify your `.gitignore`, and everything agentsmith writes under `.agentsmith/` besides the generated instructions is per-machine working state — the working-spec store (`#ai-plan`), the review-board issue store, scratch, and the install manifest. Several rules depend on these never being committed; the working-spec store in particular is defeated entirely if it lands in version control.

If you do **not** commit the generated instructions, ignore the directory:

```gitignore
.agentsmith/
```

If you **do** commit them (so teammates and CI get the set without running the installer), deny the directory and re-admit just those two paths:

```gitignore
.agentsmith/*
!.agentsmith/AGENTS.md
!.agentsmith/agents/
```

Note the `/*` — `.agentsmith/` on its own cannot be paired with `!` exceptions, because git will not re-include a file whose parent directory is excluded. Both forms are deny-by-default, so a working-state directory added by a future version is ignored without your `.gitignore` needing an edit.

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

### Upgrading: working specs are no longer committed

A working spec is now branch scratch under `.agentsmith/specs/<branch>/<date>-<slug>/`
— gitignored, per-machine, and deleted when the branch ships. A unit's durable
record is its PR body, which carries the approved scope inline.

If your project adopted the earlier workflow, two manual steps are needed after
updating the instruction set — **in this order**:

1. **Cross-check the specs before deleting them.** Git makes the contents
   recoverable, not discoverable: nobody greps deleted files. Scan for anything
   still live that exists *only* there — an open question, an accepted shortcut,
   a decision that never graduated — and move it to `docs/future-work/`,
   `docs/technical-debts/`, or `docs/design-decisions/` first. Specs still at
   `Draft`/`Approved`, or with no `Status:` line, are the ones to read closely.
   This repo's own migration found one such item across 25 directories.
2. **Then delete `docs/working-specs/`.** What remains is point-in-time history
   the current rules never consult. There is no index to regenerate and no
   `spec-index` command — both were removed with it.

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
  running **`/agentsmith:update-instructions`**, which invokes the generator with
  `--no-tools` (instructions only — the plugin already provides the tools) — so
  that command needs Node + `npx` (or a local checkout). Its counterpart
  **`/agentsmith:remove-instructions`** clears the generated instructions again;
  run it before disabling the plugin if you want the project left clean (the
  plugin cannot clean the instructions up itself). Both are plugin-only — the CLI
  never installs them.
- **Pick one path for tooling.** Installing via *both* `npx` (full) and the
  plugin double-wires the `Agent` model-enforcement hook (harmless — it is
  idempotent — but redundant) and lands two copies of every command. Use the
  plugin **or** the `npx` adapter install, not both, for tooling.

### Choosing an install path

| | Claude Code plugin | `npx` CLI |
| --- | --- | --- |
| Instructions (`AGENTS.md` + bundles) | ✗ — run `/agentsmith:update-instructions` | ✓ (`install`) |
| Tools (commands / agents / skills) | ✓ `/agentsmith:<name>` | ✓ `/agentsmith-<name>` (`install`, tools on) |
| Model-enforcement hook | ✓ via `plugin.json` | ✓ via `settings.json` |
| Update | `/plugin` (version-aware) | re-run `npx … install` |
| Teardown | disable/remove in `/plugin` (+ `/agentsmith:remove-instructions` for instructions) | `npx … uninstall` |

Two coherent paths:

- **Plugin path:** the plugin for tools, `/agentsmith:update-instructions` (`--no-tools` under the hood) for instructions. No duplication, single hook.
- **`npx`-only path:** `npx … install` does both tools and instructions; no plugin. Use `--no-tools` only if you want instructions without adapters.

Mixing a *full* `npx install` with the plugin is the case to avoid — it is the double-tools / double-hook redundancy above.

## Contributing

Working on the rules or the generator? See [CONTRIBUTING.md](CONTRIBUTING.md) for
the repository layout, how to author rules, and the dev workflow. How this repo
organizes its specs, decisions, and history is in
[docs/reference-spec/documentation-model.md](docs/reference-spec/documentation-model.md); the review-board round
protocol is in [docs/reference-spec/review-board-protocol.md](docs/reference-spec/review-board-protocol.md).
