# Spec: `agentsmith` CLI subcommand redesign

Status: Draft

## Conformance

This spec conforms to the current reference spec and design decisions with one deliberate divergence.

- No reference-spec document describes the CLI invocation surface today; the CLI is documented only in `README.md` and `CONTRIBUTING.md`.
  Those are the present-truth surfaces this change updates (#swe-docs-drift), and no `docs/reference-spec/` file is contradicted.
  This change **creates** `docs/reference-spec/cli.md` as the new present-truth home for the CLI surface (#swe-reference-spec), which the README and `--help` then summarize rather than duplicate.
- No existing design-decisions file governs the CLI flag model, so none is contradicted.
- **Divergence (intentional, breaking):** the bare invocation `agentsmith` / `node bin/cli.js` no longer performs a silent project install.
  It becomes the interactive wizard on a TTY and a hard error off a TTY.
  This is a breaking change to a documented entry point, taken deliberately while the package is pre-1.0 (`1.0.0-rc.16`).
  The new `docs/reference-spec/cli.md` documents the *present-truth* surface (WHAT the CLI is); the transition rationale for breaking bare invocation stays here as working-spec history and is not itself reference-spec material.

## Motivation

Two field bugs and three usability gaps in `bin/cli.js`, all rooted in the flag-only invocation surface.

- **Bug (high):** unknown flags are silently ignored.
  A typo such as `----no-tools` parses as absent, so `--no-tools` reads `false` and a full install runs -- the destructive opposite of the intent -- exiting `0`.
  The manifest-driven prune makes the mistake the new baseline the next correct run must undo.
- **Bug (medium):** a `--no-tools` run prunes the hook script but still merges the hook entry into `settings.json`, leaving a guaranteed-broken hook pointing at a file it just deleted.
- **Gap:** no way to remove what agentsmith installed (no uninstall / clean).
- **Gap:** the scope "modes" (project / user) are implicit and easy to get wrong; there is no confirmation before writes or deletes.
- **Gap:** running the tool with no arguments gives no guidance; a first-time user cannot discover the options.

A secondary provenance gap: an `npx github:...` install produces an `AGENTS.md` with no source-revision stamp, so a consumer cannot tell which ruleset they run.

## Goals

- Replace the flag-only surface with a verb-first subcommand model.
- Add `uninstall` (full clean) and `install --clean` (uninstall-then-install).
- Validate the flag set and fail loud on anything unrecognized.
- Print an intended-effects plan before touching disk, with a TTY-gated confirmation, `--yes`, and `--dry-run`.
- Provide an interactive wizard when invoked bare on a TTY.
- Fix both field bugs and restore the source-revision stamp on npx installs.
- Collapse three overlapping "where does it go" flags into two orthogonal, self-describing axes.
- Guarantee the CLI's install/uninstall blast radius never touches the coexisting Claude Code plugin's files.
- Land the present-truth documentation: a new CLI reference-spec (`docs/reference-spec/cli.md`) and a rewritten README, both current at #swe-done.

## Non-goals

- No change to instruction content, bundle resolution, or the generated output format.
- No change to `spec-index` behavior.
- No network features, no telemetry, no config file.
- No support for AI adapters beyond the current set.

## Design

### Invocation model

Verb-first subcommands replace the flag-only surface.

```text
agentsmith install   [--scope <user|project|PATH>] [--mode <single|split>] [--placement <root|nested>] [--no-tools] [--dev] [--clean] [--yes] [--dry-run]
agentsmith uninstall [--scope <user|project|PATH>] [--yes] [--dry-run]
agentsmith spec-index [--check]                 # unchanged
agentsmith --stdout   [--mode <single|split>]   # top-level query: generate and print, write nothing
agentsmith --help | -h
agentsmith --version
agentsmith                                       # bare: TTY -> wizard; non-TTY -> error, exit 1
```

- `--stdout` is a **top-level query flag**, not a subcommand and not part of `install`.
  It generates the core content and prints it to stdout, writing nothing.
  It stays verb-free because every in-repo consumer invokes `node bin/cli.js --stdout` with no verb (the build script, tests, the triage UI, review prompts, the instruction-review skill); keeping it top-level means zero call-site churn.
  Being a pure generate-and-print query, `--stdout` accepts only content flags (`--mode`) and ignores/rejects scope and disk flags (`--scope`, `--placement`, `--clean`, `--yes`, `--dry-run`); combining it with them is a flag-validation error.
- Bare invocation with no verb and no recognized top-level flag: interactive wizard when stdin is a TTY; otherwise `error: no subcommand -- run 'agentsmith install' or 'agentsmith --help'`, exit 1.

### The three axes

The old surface had three overlapping location-ish flags (`--user`, `--root`, `--out`).
They collapse into two orthogonal axes plus scope; each flag names exactly one axis.

| Axis | Question it answers | Flag | Values (default first) |
| --- | --- | --- | --- |
| scope | which base directory the install tree roots at | `--scope` | `project` \| `user` \| `PATH` |
| content | one inlined file vs split by module | `--mode` | `split` \| `single` |
| placement | core file at base-root vs nested under `.agentsmith/` | `--placement` | `nested` \| `root` |

- `--scope project` targets the current working directory (the default); `--scope user` targets the home directory; `--scope PATH` treats `PATH` as the base directory.
  A value that is neither `project` nor `user` is taken as a path; a directory literally named `user` or `project` is reached with a path-form value (`./user`), which the README and `--help` document.
  A `PATH` scope is validated before any op: it must be (or, for install, be creatable as) a directory; an `uninstall`/`install --clean` on a path that holds no agentsmith manifest prunes nothing (the `pruneOrphans` bound) rather than erroring.
- `--mode single` inlines every bundle into one file (the old `--full` / `--inline`); `--mode split` writes the lean core plus one file per on-demand bundle (the default).
- `--placement root` writes the real core to the base root as `AGENTS.md`; `--placement nested` writes the core under `.agentsmith/` with a root stub pointing at it (the default).
- `--out` is **removed**: it has zero consumers in the repo, and `--scope PATH` plus `--placement` cover every real relocation.

### The `Plan` abstraction

A `Plan` is a pure, in-memory description of the filesystem effects a command intends, built with no disk writes.
It is the single representation three features share.

- Each op is one of: `write(path)`, `prune(path)`, `mergeSettings(path)`, `unmergeSettings(path)`, `writeImport(path)`, `removeImport(path)`, `keepStub(path)`, `keepImport(path)`.
- `--dry-run` builds the plan, prints it, and exits `0`.
- Confirmation prints the same plan before applying.
- Execution applies the plan to disk.

Printing and applying consume one structure, so the preview can never drift from what runs.

**User-facing rendering.** The op names above are the internal enum; they are never printed verbatim.
The plan renders for the reader (#swe-display-messages), grouped by effect and with destructive effects visually distinct from additive ones so a `y/N` on a destructive run is unambiguous:

```text
agentsmith will:
  write   5 files under .agentsmith/ and .claude/
  update  .claude/settings.json  (add agentsmith hook)
  keep    ./AGENTS.md            (your stub, unchanged)

agentsmith uninstall will REMOVE:
  delete  39 files under ~/.agentsmith/ and ~/.claude/
  update  ~/.claude/settings.json   (remove agentsmith hook)
  update  ~/.claude/CLAUDE.md        (remove agentsmith import)
```

Removals are labelled `delete`/`REMOVE`; additive effects are `write`/`update`.
Counts summarize large groups rather than listing every path.

### Decomposition

`bin/cli.js` is 263 lines mixing argument parsing, planning, and disk I/O.
The redesign splits it so each unit has one purpose and is testable in isolation (#swe-decomposition).

| Unit | Responsibility | Purity |
| --- | --- | --- |
| `src/args.js` | parse `argv` into `{ command, scope, flags }`; validate the flag set, fail loud on unknown flags and on conflicting axis values | pure |
| `src/plan.js` | `buildInstallPlan(...)` / `buildUninstallPlan(...)` -> `Plan` | pure |
| `src/execute.js` | apply a `Plan` to disk | effectful |
| `src/prompt.js` | render a `Plan` for humans; TTY confirmation; the interactive wizard | effectful (I/O seam) |
| `src/userimport.js` | add `userUnimport()` (inverse of `userImport()`) | pure |
| `bin/cli.js` | thin orchestrator: parse -> build plan -> (print -> confirm) -> execute | effectful |

The parser is the single source of truth for known flags, which is what makes fail-loud validation possible (the high-severity bug fix).

**Injectable I/O seam (for testability).** `src/prompt.js` takes its terminal I/O as an injected dependency rather than reaching for `process.stdin`/`stdout` directly: a seam `{ isTTY: boolean, ask: (question) => Promise<answer> }`.
Production wiring passes the real `process.stdout.isTTY` and a `readline`-backed `ask`; tests pass a fake `isTTY` flag and a scripted `ask` that returns queued answers.
Both the confirmation prompt and the wizard consume this one seam, so both are testable without a real TTY (see Testing).

### `uninstall` (full clean)

Uninstall reverses everything an install of the same scope wrote, reusing existing primitives.

- **Files:** prune every path in the install manifest -- `pruneOrphans(base, manifest.paths)` -- then delete the manifest file itself.
- **`settings.json`:** un-merge agentsmith's owned hook entries.
  `mergeSettings(existing, {})` already does this: its deprecation sweep drops every owned event when no owned events are supplied.
  No new function; the plan emits an `unmergeSettings` op that calls `mergeSettings(existing, {})`.
- **`~/.claude/CLAUDE.md`** (user scope): remove the marked import block via a new pure `userUnimport(existingContent, targetPath)` -- the inverse of `userImport`, removing the `<!-- agentsmith: generated user instructions -->` marker and its import line, and nothing else.
- **Root stub:** delete only if it still matches the generated stub content; if the user edited it, keep it and report that it was kept.

The `settings.json` and `CLAUDE.md` edits inherit the existing malformed-input guard (`installSettings` already warns and leaves an unparseable `settings.json` untouched rather than clobbering it); the un-merge and un-import paths do the same, so a hand-corrupted file is never overwritten.

### `install --clean`

`install --clean` builds an uninstall plan for the target scope and an install plan, then applies uninstall followed by install in one invocation.
It guarantees no cross-version residue even when the manifest has drifted or been lost -- a belt-and-suspenders complement to the per-run orphan prune, which already deletes paths a new version stopped producing but cannot recover a lost manifest.

### Plugin coexistence

agentsmith ships two independent delivery channels: the CLI generator (this tool) and the Claude Code plugin (`/plugin install agentsmith`).
A user may run both, and the CLI's install/uninstall is bounded so it never touches the plugin's files.

- **Disjoint paths.** The plugin's skills/agents/commands/hook live under the plugin cache subtree (`~/.claude/plugins/...`), managed by `/plugin`. The CLI writes only under the install base's `.claude/{skills,agents,commands,hooks}/` (`~/.claude/...` for `--scope user`). The two subtrees do not overlap.
- **Manifest-bounded prune.** `uninstall` and the orphan-prune delete only paths recorded in `.agentsmith/.install-manifest.json`; `pruneOrphans` never touches an unlisted path, and the plugin cache is never recorded. **Uninstalling the CLI install cannot erase the plugin's tools.**
- **Settings vs `plugin.json`.** The plugin registers its `PreToolUse` hook through its own `plugin.json` (loaded by Claude Code), not the user's `settings.json`. The CLI's merge/un-merge edits only `settings.json`, so it neither adds to nor removes the plugin's hook registration. Both hook commands share the path marker `/hooks/agentsmith/` (the CLI's `settings.json` ownership marker), which is safe because they live in different files: the marker means "an agentsmith-owned hook entry *in settings.json*", which a plugin hook never is.
- **Duplication, not erasure, is the real caveat.** A full CLI `install` alongside the plugin installs a *second* copy of every skill/agent/command under `.claude/`, duplicating the plugin's registrations. Installing with `--no-tools` (instructions only) is the documented way to run the CLI beside the plugin. This redesign does not change that; the README calls it out.

This section is a design **guarantee**, tested: an install/uninstall run with a simulated plugin-cache path present asserts that path is untouched.

### Confirmation gate

The plan is always printed before any write or delete.
The gate then branches on **whether the command is destructive**, because the #ai-tool-safety floor requires a destructive or irreversible action to be confirmed regardless of interaction mode -- absence of a TTY is not durable authorization, an explicit `--yes` is.

- **Non-destructive** = `install` without `--clean` (writes and overwrites owned paths; the manifest orphan-prune only removes paths a prior agentsmith run recorded).
- **Destructive** = `uninstall` and `install --clean` (delete files the user may not expect, un-merge settings, remove the import).

| Command class | `--dry-run` | `--yes` | TTY, no `--yes` | non-TTY, no `--yes` |
| --- | --- | --- | --- | --- |
| non-destructive | print, exit `0` | print, apply | print, prompt `y/N` | print, apply (preserves the zero-friction `npx` one-liner and CI) |
| destructive | print, exit `0` | print, apply | print, prompt `y/N` | print, **abort** non-zero: `error: refusing to <verb> without confirmation -- pass --yes` |

So a destructive run off a TTY never proceeds silently: it requires the explicit, durable `--yes`.
This is a safety-floor gate independent of the #ai-preflight interaction mode (#ai-tool-safety).

### Interactive wizard

Bare `agentsmith` on a TTY runs the full wizard: verb (install / uninstall) -> scope (project / user / directory path) -> then, **only on the install path**, content mode (split / single) -> placement (root / nested) -> tool adapters (yes / no) -> dev adapters (yes / no); the uninstall path skips the four install-only prompts and goes straight from scope to the plan -> print the resulting plan -> confirm.
The wizard produces the same `{ command, scope, flags }` a parsed command line would, then flows through the identical plan/confirm/execute path -- the wizard is an input source, not a second code path.
Every prompt shows its default and the wizard can be aborted at any point (Ctrl-C, or an empty answer at the verb prompt), leaving the disk untouched.

### Help and version

`--help` / `-h` prints, to stdout, exit `0`: a one-line usage synopsis, the subcommand list (`install`, `uninstall`, `spec-index`) with a one-line description each, the flags grouped under the subcommand they belong to with a one-line description each, and two or three examples (`agentsmith install`, `agentsmith install --scope user`, `agentsmith uninstall --scope user --yes`).
Per-verb help (`agentsmith install --help`) prints just that verb's flags and examples.
`--version` prints the resolved package version (the same value the revision-stamp fallback uses) and exits `0`.
Help and version are queries: they never build or apply a plan.

### Bug fixes folded in

- **Unknown-flag validation:** `src/args.js` holds the known-flag set per subcommand and exits non-zero on any unrecognized token (skipping the value after a value-taking flag).
  Exiting non-zero matters more than the message: an install that would do the opposite of the request must never exit `0`.
- **Stale hook entry on tools-less install:** when tool adapters are not installed, the install plan emits `unmergeSettings` instead of `mergeSettings`, so a `--no-tools` (or wizard "no adapters") run **removes** agentsmith's hook entry rather than re-adding one that points at a pruned script.
- **Source-revision stamp fallback:** `sourceRevision()` falls back to `package.json`'s `version` when `git` is unavailable (the npx case), restoring provenance in the header without reintroducing git-error noise.

## Flag migration

| Old | New | Notes |
| --- | --- | --- |
| `node bin/cli.js` (bare install) | `agentsmith install` | bare now means wizard/error |
| `--user` | `--scope user` | |
| `--full` / `--inline` | `--mode single` | |
| `--root` | `--placement root` | |
| `--out PATH` | (removed) | zero consumers; use `--scope PATH` + `--placement` |
| `--no-tools` | `--no-tools` | unchanged; now also un-merges the hook |
| `--dev` | `--dev` | unchanged (an `install` modifier) |
| `--stdout` | `--stdout` | unchanged; top-level query, verb-free |
| `spec-index [--check]` | `spec-index [--check]` | unchanged |

### In-repo consumers to update in this PR (#swe-docs-drift)

- `package.json` `build` script: `node bin/cli.js` -> `node bin/cli.js install`; `build -- --stdout` stays valid (`--stdout` remains verb-free).
- `test/cli.test.js`: bare-install and `--user` / `--dev` / `--no-tools` runs migrate to `install [--scope ...]`; new tests added below.
- `tools/claude/commands/agentsmith-init.md`: **shipped command adapter** -- its local-clone fallback `node bin/cli.js` (project) / `node bin/cli.js --user` migrates to `node bin/cli.js install` / `node bin/cli.js install --scope user`. User-facing surface; must be correct at ship.
- `devtools/claude/commands/instruction-apply.md` and `devtools/claude/skills/instruction-review-board/SKILL.md`: their regenerate step `node bin/cli.js` (bare) -> `node bin/cli.js install`.
- `README.md` Usage: rewrite for subcommands; the documented one-liner becomes `npx github:viniciussegura/agentsmith install`. The rewrite documents **every** new subcommand and flag (`install`/`uninstall`/`--clean`/`--scope`/`--mode`/`--placement`/`--dry-run`/`--yes`/`--help`/`--version`) with at least one example each, and deletes the removed-flag lines (`--out`/`--full`/`--inline`/`--root`/`--user`) (#swe-public-surface-docs, #swe-docs-drift).
- `CONTRIBUTING.md`: `node bin/cli.js --dev` -> `node bin/cli.js install --dev`.
- `docs/technical-debts/2026-06-02-stale-user-import.md`: uninstall's `userUnimport` removes only agentsmith's own marked import block, which is exactly the debt's scope -- so this **closes** the debt. Per #swe-technical-debts, the file is **deleted** in this PR (git history preserves it). If implementation reveals a residual (e.g. a hand-edited import the marker no longer matches), the file is instead narrowed to that residual rather than deleted.
- Frozen `docs/working-specs/*` specs that mention `node bin/cli.js` are point-in-time history (append-only, #ai-plan) and are **not** edited.

## Testing

Unit tests (single documented harness, `node --test`):

- `src/args.js`: each subcommand parses; unknown flag exits non-zero; conflicting scope value rejected; `--scope PATH` recognized; value-taking flags skip their value during unknown detection.
- `src/plan.js`: install plan for project / user / PATH scope; `--no-tools` emits `unmergeSettings` (bug-2 regression); uninstall plan lists all manifest paths + unmerge + unimport; `--clean` composes uninstall then install.
- `src/userimport.js`: `userUnimport` removes exactly the marked block and is a no-op when absent; round-trips with `userImport`.
- `settings.js`: `mergeSettings(existing, {})` drops owned entries and preserves user entries (the un-merge path).
- `sourceRevision()`: falls back to `package.json` version when git is unavailable.
- Confirmation gating: via the injected `{ isTTY, ask }` seam (no real stdin) -- assert apply/prompt per both rows of the table, including that a destructive command off a TTY without `--yes` aborts non-zero.
- Wizard: drive `prompt.js` through the same seam with scripted `ask` answers; assert the produced `{ command, scope, flags }` matches the equivalent command line, and that an abort leaves no plan applied.

Integration test (`install --clean` drift recovery): install, then stale the manifest (remove or truncate it) and drop an orphan file the current sources do not produce; run `install --clean`; assert the orphan is gone and the tree matches a fresh install.

Integration test (plugin coexistence): with a simulated plugin-cache path (`<base>/.claude/plugins/...`) and file present, run `install` then `uninstall`; assert the simulated plugin path is untouched by both (bounded-manifest guarantee).

Every bug fix starts with a failing test that reproduces it (#swe-testing): the `----no-tools`-style unknown flag exiting `0`, and the stale hook entry after a `--no-tools` run.

## Docs drift

The call-site and command-doc migrations are enumerated in **In-repo consumers to update** above (README, CONTRIBUTING, `agentsmith-init.md`, `instruction-apply.md`, the instruction-review SKILL, the technical-debt file); that list is the authoritative set.
Beyond it, this change also touches:

- `docs/reference-spec/cli.md` -- **created**: the present-truth CLI surface (subcommands, the three axes, `--stdout`/`--help`/`--version`, the confirmation gate, plugin coexistence). README and `--help` summarize it; it is the single place current CLI truth lives (#swe-reference-spec).
- `docs/working-specs/INDEX.md` -- regenerated (`agentsmith spec-index`).
- No `docs/design-decisions/` file governs the CLI; none needs editing.

The `docs/technical-debts/2026-06-02-stale-user-import.md` debt is **closed** (file deleted) as stated in the consumers list, not merely narrowed, unless implementation surfaces a residual.

## Risks and open questions

- **Breaking bare invocation.** Any external script relying on bare `npx github:...` for a silent project install breaks and must add `install`. Accepted, pre-1.0, documented as a major note.
- **Wizard scope.** The full wizard is six prompts; if that feels heavy in practice, prompts can be trimmed later without touching the plan/execute path.
- **`--out` removal.** Confirmed zero in-repo consumers; an undocumented external user of `--out` would lose it. Accepted given `--scope PATH` covers the case.
