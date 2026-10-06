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

`install` takes one input beyond its flags: `<base>/.agentsmith/docs-layout.yaml`, the project's docs-layout remap (its shape and both row forms are in [`docs-layout-config.md`](./docs-layout-config.md)).
It is read after the scope's base is resolved and before any output is generated, so a bad config cannot produce a half-written tree; it is never created, modified, recorded in the install manifest, or removed by `uninstall`.
**`uninstall` does not read it at all.** It writes no map, so validating the config there would let a stale one -- a row tag renamed by a later release, say -- block the user from removing an install that never consults it.
An absent file, or one holding only comments and an empty `rows:`, means no overrides and changes nothing.
A path whose own directory entry is present but does not resolve -- a broken symlink -- is an error rather than an absent config: the alternative is handing back the default layout in silence for a file the user put there.
A malformed one is a hard error: `<file>:<line>: <what is wrong>; <what is allowed>; no output was generated` on stderr, exit `1`, before the plan is printed and before anything is written, and the message never echoes the offending value.
The same exit `1` fires when a non-blank config is present and the `#swe-docs-layout` rule is not in the generated instruction set — the arm that turns a silently non-applied override into a loud failure.

On an install plan for any scope other than `user`, `install` asks `git check-ignore` whether that file, and the hooks opt-out `.agentsmith/hooks.yaml` ([Hooks](#hooks)), is ignored and warns on stderr for each that is, since the README's gitignore recipes deny `.agentsmith/` wholesale:

```text
agentsmith: warning -- .agentsmith/docs-layout.yaml is gitignored, so teammates will not get this layout. Add '!.agentsmith/docs-layout.yaml' after '.agentsmith/*' in .gitignore (see README).
agentsmith: warning -- .agentsmith/hooks.yaml is gitignored, so it is never committed and the hooks ignore it. Add '!.agentsmith/hooks.yaml' after '.agentsmith/*' in .gitignore (see README).
```

The probe is advisory: the exit code stays `0`, and it is silent when the file is absent, already tracked, or git is unreachable.

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

It **reads no `.agentsmith/docs-layout.yaml`**, so it always prints the default `#swe-docs-layout` table, whatever config sits in the working directory.
That follows from having no scope axis to read a config against, and it is what keeps agentsmith's own layout config out of the in-repo consumers above — the plugin build and the instruction-integrity test would otherwise take this repo's config as an input.
`install --dry-run`, and the installed `.agentsmith/AGENTS.md`, are the two ways to see a remapped set.

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
  update  .claude/settings.json (add agentsmith hooks)
  keep    AGENTS.md (unchanged)
```

The scope reads `user`, `project`, or `folder` (a `--scope PATH`), matching what the flag takes; the path is always the resolved absolute base, whichever form was given.
Deletes are listed in full, never truncated behind an ellipsis.

An install plan whose scope carries a docs-layout config gains one further line, below the scope line, naming every effective remap:

```text
  layout  2 row(s) remapped from .agentsmith/docs-layout.yaml: swe-design-decisions -> docs/adr/<decision-slug>.md, swe-technical-debts -> external -- jira/ENG
```

It exists because the plan is otherwise blind to a content change inside a generated file: every other line names a path, not what goes in it.
Rows appear in the order the config lists them, an external row reads `external -- <label>`, and the line is silent when there is no config or it yields no overrides.
It is emitted on install plans only — an uninstall writes no map — and `install --clean` therefore carries it once, on the install plan it confirms after the uninstall plan.

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

## Hooks

The Claude adapter installs four PreToolUse hooks under `.claude/hooks/agentsmith/` (the plugin ships the same four through `plugin.json`).
Each reads the host's tool payload from stdin as untrusted data, matched with linear-time patterns and never echoed into a message.

| hook | matches | blocks |
| --- | --- | --- |
| `require-explicit-model` | `Agent` | a subagent dispatch with no `model` (`#ai-conversational`) |
| `guard-default-branch` | `Bash`, `PowerShell` | `commit`, `merge`, `cherry-pick`, `revert`, `am`, or `rebase` while the current branch is the default branch (`#git-branch-workflow`); `merge --ff-only` is allowed |
| `guard-git-flags` | `Bash`, `PowerShell` | `push` with `--force`, `-f`, `--force-with-lease`, `--force-if-includes`, or a `+` refspec; `--no-verify` on any subcommand, `commit -n`; a `core.hooksPath` override through `-c`, `--config-env`, `GIT_CONFIG_*`, or `git config` (`#git-branch-workflow`, `#git-tooling`) |
| `guard-dated-todos` | `Write`, `Edit`, `MultiEdit` | an added line carrying `TODO`, `FIXME`, `HACK`, `XXX`, or `BUG` without `(YYYY-MM-DD)` after the word; prose files (`.md`, `.mdx`, `.txt`) are out of scope (`#swe-dated-todos`) |

Exit codes: `2` blocks and the message on stderr names the rule and the remedy; `0` allows silently; `1` allows and prints one line saying what the hook could not evaluate, the host's non-blocking channel.
A block from any segment of a command wins over a notice, and a notice over a silent allow.
A notice is raised when the git state cannot be read or times out, the directory is not a repository, no default branch resolves (no `origin/HEAD`, `init.defaultBranch`, `main`, or `master`), the command chooses its repository through `--git-dir`, `--work-tree`, `GIT_DIR`, `GIT_WORK_TREE`, or a non-literal `cd`, or a quote is unterminated.

The git guards split a command on `&&`, `||`, `;`, `|`, `&`, and newlines, honour quoting, read into `bash -c` strings, `$(...)`, and backticks, skip env words and the wrappers `env`, `command`, `exec`, `time`, `timeout`, `nice`, `ionice`, `nohup`, `setsid`, `stdbuf`, `sudo`, `doas`, `rtk proxy`, `xargs`, and `find -exec`, skip git's global options, and treat an unambiguous abbreviation of a blocked long option as that option.
They are a tripwire for the agent's own commands, not a sandbox.
Not covered: git aliases; scripts and tools that call git (`gh`, `npm version`); wrappers outside that set; `eval`, a `$VAR` command head, and `cmd /c`; a `git pull` that merges; heredoc bodies; a second clone whose own HEAD carries an opt-out; commands typed by the user.

**Opt-out.** A project switches a hook off in `.agentsmith/hooks.yaml`, read from the committed content at `HEAD` of the repository the command targets, never from the working tree, so disabling a guard takes a commit the branch diff shows:

```yaml
# a project decision; names are the script names
disabled:
  - guard-default-branch
```

Only `#` comments, blank lines, one `disabled:` line, and indented `- <name>` lines are accepted; any other content is malformed, keeps every hook on, and is reported with the notice line.
The opt-out file, `.claude/settings.json`, and the hook scripts are agent-editable; review of the commit that edits them is the control.
Both README gitignore recipes re-admit the file, and the install plan warns when it is ignored (see `install`).

## Plugin coexistence

agentsmith ships two independent delivery channels: this CLI generator, and the Claude Code plugin (`/plugin install agentsmith`).
A user may run both; the CLI's `install` / `uninstall` is bounded so it never touches the plugin's files.

- **Disjoint paths.** The plugin's skills/agents/commands/hooks live under the plugin cache subtree (`~/.claude/plugins/...`), managed by `/plugin`. The CLI writes only under the install base's `.claude/{skills,agents,commands,hooks}/` (`~/.claude/...` for `--scope user`). The two subtrees do not overlap.
- **Manifest-bounded prune.** `uninstall` and the per-run orphan-prune delete only paths recorded in `.agentsmith/.install-manifest.json`; the plugin cache is never recorded there, so it is never a candidate for deletion. Uninstalling the CLI install cannot erase the plugin's tools. The prune's empty-parent-directory climb stops at any non-empty directory and at the base, so a populated sibling such as `.claude/plugins/` is never removed even when the CLI empties `.claude/skills/`.
- **`settings.json` vs. `plugin.json`.** The plugin registers its `PreToolUse` hooks through its own `plugin.json` (loaded by Claude Code directly), not the user's `settings.json`. The CLI's merge / un-merge ops edit only `settings.json`, using the ownership marker `/hooks/agentsmith/` to identify agentsmith-owned entries there; this neither adds to nor removes the plugin's hook registrations.
- **Explicit assumption.** This reasoning rests on one assumption: Claude Code keeps plugin hooks in `plugin.json` and never materializes them into `settings.json`. If that assumption ever fails -- or a user hand-copies a plugin hook command into `settings.json` -- the CLI's un-merge would remove that settings-resident entry. The plugin's *tools* remain protected regardless, by the disjoint-paths and manifest-bound guarantees above, which do not depend on this assumption.
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
| `--no-tools` | `--no-tools` | unchanged; now also un-merges the hooks |
| `--dev` | `--dev` | unchanged (an `install` modifier) |
| `--stdout` | `--stdout` | unchanged; top-level query, verb-free |
| `spec-index [--check]` | *(removed)* | the index it maintained no longer exists (`#ai-plan`) |
