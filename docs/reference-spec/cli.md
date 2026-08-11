# CLI surface

The present-truth reference for the `agentsmith` command line (`bin/cli.js`).
It is the single drift-checked source of current CLI truth; the [README](../../README.md) Usage section and `--help` summarize it rather than re-specifying it.

## Subcommands

```text
agentsmith install    [--scope <user|project|PATH>] [--mode <single|split>] [--placement <root|nested>] [--no-tools] [--dev] [--clean] [--yes] [--dry-run]
agentsmith uninstall  [--scope <user|project|PATH>] [--yes] [--dry-run]
agentsmith --stdout   [--mode <single|split>]
agentsmith --help | -h
agentsmith --version
agentsmith                        (bare: TTY -> interactive wizard; non-TTY -> error, exit 1)
```

### `install`

Writes the generated instructions (and, unless `--no-tools`, the tool adapters) under the resolved scope's base directory.
Prints the intended-effects plan, gates it through the confirmation rules below, then applies it and writes the install manifest.

- `--scope <user|project|PATH>` -- which base directory the install tree roots at. Default `project`.
- `--mode <single|split>` -- one inlined file vs. the lean core plus one file per on-demand bundle. Default `split`.
- `--placement <root|nested>` -- core file at the base root vs. nested under `.agentsmith/` with a root stub. Default `nested`.
- `--no-tools` -- skip installing the tool adapters (`.claude/{skills,agents,commands,hooks}/`); instructions-only.
- `--dev` -- also install the authoring-only devtools adapter (`devtools/claude/`), for dogfooding this repo.
- `--clean` -- build an uninstall plan for the target scope and an install plan, then apply uninstall followed by install in one invocation. Guarantees no cross-version residue even when the manifest has drifted or been lost. Destructive (see Confirmation gate). With `--dry-run` both halves are previewed (the uninstall plan then the install plan) and nothing is applied.
- `--yes` -- skip the interactive confirmation prompt; a durable authorization for a destructive run off a TTY.
- `--dry-run` -- print the plan and exit `0` without touching disk.

Examples:

```bash
agentsmith install
agentsmith install --scope user
agentsmith install --scope ./other-project --mode single --placement root
agentsmith install --no-tools
agentsmith install --clean --yes
```

### `uninstall`

Reverses everything an install of the same scope wrote: prunes every path recorded in the install manifest, deletes the manifest itself, un-merges agentsmith's owned `settings.json` hook entries, removes the marked `~/.claude/CLAUDE.md` import (user scope only), and deletes the root stub if it still matches the generated content (an edited stub is kept, and reported as kept).
Always destructive (see Confirmation gate).

- `--scope <user|project|PATH>` -- same axis as `install`. Default `project`.
- `--yes` -- skip the interactive confirmation prompt.
- `--dry-run` -- print the plan and exit `0` without touching disk.

Examples:

```bash
agentsmith uninstall
agentsmith uninstall --scope user --yes
```

An `uninstall` (or `install --clean`) targeting a scope that holds no agentsmith manifest prunes nothing -- the manifest-bounded prune (below) makes this a no-op, not an error.

### `--stdout`

A top-level query flag, not a subcommand and not part of `install`.
Generates the core content and prints it to stdout; writes nothing.
It stays verb-free because every in-repo consumer invokes `node bin/cli.js --stdout` with no verb (the build script, tests, the triage UI, review prompts, the instruction-review skill), so keeping it top-level means zero call-site churn.

Being a pure generate-and-print query, `--stdout` accepts only `--mode` and rejects scope or disk flags (`--scope`, `--placement`, `--clean`, `--yes`, `--dry-run`); combining it with them is a flag-validation error.

```bash
agentsmith --stdout
agentsmith --stdout --mode single
```

### `--help` / `-h` and `--version`

`--help` (or `-h`) prints the top-level usage synopsis -- the subcommand and query-flag list, a short scope note, and a few examples -- then exits `0`.
`agentsmith install --help` / `agentsmith uninstall --help` print just that verb's synopsis, its own flags, and one example.
`--version` prints the resolved package version -- the same value the source-revision-stamp fallback uses -- and exits `0`.
Help and version are queries: they never build or apply a plan.

### Bare invocation

`agentsmith` with no verb and no recognized top-level flag runs the interactive wizard when stdin is a TTY.
Off a TTY it errors: `agentsmith: error -- no subcommand -- run 'agentsmith install' or 'agentsmith --help'`, exit `1`.
This is a deliberate, breaking divergence from the pre-redesign behavior, where bare invocation performed a silent project install; it is documented here as current truth, not re-argued (the transition rationale is in git and in the PR that carried it).

Unknown flags and unknown subcommands are hard errors (`agentsmith: error -- unknown flag: ...` / `unknown subcommand: ...`), exit `1`, never silently ignored.

## The three axes

The location-ish surface collapses into two orthogonal axes plus scope; each flag names exactly one axis.

| Axis | Question it answers | Flag | Values (default first) |
| --- | --- | --- | --- |
| scope | which base directory the install tree roots at | `--scope` | `project` \| `user` \| `PATH` |
| content | one inlined file vs. split by module | `--mode` | `split` \| `single` |
| placement | core file at base-root vs. nested under `.agentsmith/` | `--placement` | `nested` \| `root` |

- `--scope project` targets the current working directory (the default); `--scope user` targets the home directory; `--scope PATH` treats `PATH` as the base directory (relative paths resolve against the current working directory).
  A value that is neither `project` nor `user` is taken as a path; a directory literally named `user` or `project` is reached with a path-form value (`./user`).
- A `PATH` scope is validated before any operation, for `install`, `uninstall`, and `install --clean` alike: if the path exists and is not a directory, it is an error (`--scope path is not a directory: <path>`); a nonexistent path is allowed -- `install` creates it, `uninstall` / `install --clean` find nothing to prune there.
- `--mode single` inlines every bundle into one file; `--mode split` writes the lean core plus one file per on-demand bundle (the default).
- `--placement root` writes the real core to the base root as `AGENTS.md`; `--placement nested` writes the core under `.agentsmith/` with a root stub pointing at it (the default). The root stub is write-once: an existing stub is left untouched by `install`, and `uninstall` deletes it only if it still matches the generated stub content, keeping (and reporting as kept) anything the user edited.

## Confirmation gate

The intended-effects plan is always printed before any write or delete.

Its first line after the header states the scope and the absolute base directory every path below is relative to, so a confirmation never leaves the reader guessing which tree is about to be written to or deleted from:

```text
agentsmith plan:
  Scope: project (/home/vinic/dev/myrepo)
  write   37 file(s): .agentsmith/AGENTS.md, .agentsmith/agents/frontend.md, ...
  update  .claude/settings.json (add agentsmith hook)
  keep    AGENTS.md (unchanged)
```

The scope reads `user`, `project`, or `folder` (a `--scope PATH`), matching what the flag takes; the path is always the resolved absolute base, whichever form was given.
Deletes are listed in full, never truncated behind an ellipsis.

The gate then branches on whether the command is destructive:

- **Non-destructive** = `install` without `--clean` (writes and overwrites owned paths; the manifest orphan-prune only removes paths a prior agentsmith run recorded).
- **Destructive** = `uninstall` and `install --clean` (delete files the user may not expect, un-merge settings, remove the import).

| Command class | `--dry-run` | `--yes` | TTY, no `--yes` | non-TTY, no `--yes` |
| --- | --- | --- | --- | --- |
| non-destructive | print, exit `0` | print, apply | print, prompt `y/N` | print, apply (preserves the zero-friction `npx` one-liner and CI) |
| destructive | print, exit `0` | print, apply | print, prompt `y/N` | print, **abort** non-zero: `error: refusing to <verb> without confirmation -- pass --yes` |

A destructive run off a TTY never proceeds silently: absence of a TTY is not durable authorization, an explicit `--yes` is.
This gate is independent of any AI-agent interaction mode; it applies identically to a human at a terminal, a CI job, and an AI agent driving the CLI.
For `install --clean`, `--dry-run` prints both the uninstall and the install plan (the full preview of the two-stage run) before exiting `0`; a real run gates each stage separately.

## Interactive wizard

Bare `agentsmith` on a TTY runs the wizard: verb (install / uninstall) -> scope (project / user / directory path) -> then, only on the install path, content mode (split / single) -> placement (root / nested) -> tool adapters (yes / no) -> dev adapters (yes / no); the uninstall path skips the four install-only prompts and goes straight from scope to the plan.
It then prints the resulting plan and runs the same confirmation gate as a parsed command line.
Each prompt validates its answer against the allowed set.
The content and placement prompts show a default that an empty answer accepts; the verb prompt has no default.
An empty or unrecognized answer at the verb, content, or placement prompt is re-asked once, and a second unrecognized answer aborts the wizard (`agentsmith: aborted`, exit `0`, disk untouched) rather than silently steering into a different action.
The wizard can also be aborted at any point with Ctrl-C, leaving the disk untouched.
The wizard is an input source, not a second code path: it produces the same `{ command, scope, flags }` shape a parsed command line would, and flows through the identical plan/confirm/execute path.

## Plugin coexistence

agentsmith ships two independent delivery channels: this CLI generator, and the Claude Code plugin (`/plugin install agentsmith`).
A user may run both; the CLI's `install` / `uninstall` is bounded so it never touches the plugin's files.

- **Disjoint paths.** The plugin's skills/agents/commands/hook live under the plugin cache subtree (`~/.claude/plugins/...`), managed by `/plugin`. The CLI writes only under the install base's `.claude/{skills,agents,commands,hooks}/` (`~/.claude/...` for `--scope user`). The two subtrees do not overlap.
- **Manifest-bounded prune.** `uninstall` and the per-run orphan-prune delete only paths recorded in `.agentsmith/.install-manifest.json`; the plugin cache is never recorded there, so it is never a candidate for deletion. Uninstalling the CLI install cannot erase the plugin's tools. The prune's empty-parent-directory climb stops at any non-empty directory and at the base, so a populated sibling such as `.claude/plugins/` is never removed even when the CLI empties `.claude/skills/`.
- **`settings.json` vs. `plugin.json`.** The plugin registers its `PreToolUse` hook through its own `plugin.json` (loaded by Claude Code directly), not the user's `settings.json`. The CLI's merge / un-merge ops edit only `settings.json`, using the ownership marker `/hooks/agentsmith/` to identify agentsmith-owned entries there; this neither adds to nor removes the plugin's hook registration.
- **Explicit assumption.** This reasoning rests on one assumption: Claude Code keeps plugin hooks in `plugin.json` and never materializes them into `settings.json`. If that assumption ever fails -- or a user hand-copies the plugin hook command into `settings.json` -- the CLI's un-merge would remove that settings-resident entry. The plugin's *tools* remain protected regardless, by the disjoint-paths and manifest-bound guarantees above, which do not depend on this assumption.
- **Duplication, not erasure, is the real caveat.** A full CLI `install` alongside the plugin installs a second copy of every skill/agent/command under `.claude/`, duplicating the plugin's registrations -- harmless but redundant. Installing with `--no-tools` (instructions only) is the documented way to run the CLI beside the plugin.
- **Plugin-only lifecycle commands.** The plugin ships two commands the CLI deliberately does **not** install: `/agentsmith:update-instructions` (generate/refresh the instruction set via `install --no-tools`) and `/agentsmith:remove-instructions` (clear it via `uninstall`). They exist because the plugin provides tools but not instructions, so a plugin user needs a generator entrypoint. They are excluded from the CLI adapter install (`PLUGIN_ONLY_COMMANDS` in `src/tools.js`) because their `--no-tools` install would prune the very adapters a full CLI install wrote -- a footgun for a CLI user, who instead just re-runs `install`. The plugin auto-discovers them from `tools/claude/commands/`; only the CLI-copy path skips them.

This is a tested guarantee: an install/uninstall run against a simulated plugin-cache path asserts that path is left untouched by both, and `planToolInstall` is asserted to exclude the plugin-only commands.

## Flag migration (pre-redesign -> current)

| Old | New | Notes |
| --- | --- | --- |
| `node bin/cli.js` (bare install) | `agentsmith install` | bare now means wizard / error |
| `--user` | `--scope user` | |
| `--full` / `--inline` | `--mode single` | |
| `--root` | `--placement root` | |
| `--out PATH` | (removed) | zero in-repo consumers; use `--scope PATH` plus `--placement` |
| `--no-tools` | `--no-tools` | unchanged; now also un-merges the hook |
| `--dev` | `--dev` | unchanged (an `install` modifier) |
| `--stdout` | `--stdout` | unchanged; top-level query, verb-free |
| `spec-index [--check]` | *(removed)* | the index it maintained no longer exists (`#ai-plan`) |
