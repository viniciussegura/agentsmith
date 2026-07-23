# Spec: `agentsmith` CLI subcommand redesign

Status: Draft

## Conformance

This spec conforms to the current reference spec and design decisions with one deliberate divergence.

- No reference-spec document describes the CLI invocation surface today; the CLI is documented only in `README.md` and `CONTRIBUTING.md`.
  Those are the present-truth surfaces this change updates (#swe-docs-drift), and no `docs/reference-spec/` file is contradicted.
- No existing design-decisions file governs the CLI flag model, so none is contradicted.
- **Divergence (intentional, breaking):** the bare invocation `agentsmith` / `node bin/cli.js` no longer performs a silent project install.
  It becomes the interactive wizard on a TTY and a hard error off a TTY.
  This is a breaking change to a documented entry point, taken deliberately while the package is pre-1.0 (`1.0.0-rc.16`).
  It is recorded here rather than in a decision file because it is local to this unit of work; if a CLI reference-spec doc is later warranted, the standing rationale moves there.

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
  A value that is neither `project` nor `user` is taken as a path.
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

### `uninstall` (full clean)

Uninstall reverses everything an install of the same scope wrote, reusing existing primitives.

- **Files:** prune every path in the install manifest -- `pruneOrphans(base, manifest.paths)` -- then delete the manifest file itself.
- **`settings.json`:** un-merge agentsmith's owned hook entries.
  `mergeSettings(existing, {})` already does this: its deprecation sweep drops every owned event when no owned events are supplied.
  No new function; the plan emits an `unmergeSettings` op that calls `mergeSettings(existing, {})`.
- **`~/.claude/CLAUDE.md`** (user scope): remove the marked import block via a new pure `userUnimport(existingContent, targetPath)` -- the inverse of `userImport`, removing the `<!-- agentsmith: generated user instructions -->` marker and its import line, and nothing else.
- **Root stub:** delete only if it still matches the generated stub content; if the user edited it, keep it and report that it was kept.

### `install --clean`

`install --clean` builds an uninstall plan for the target scope and an install plan, then applies uninstall followed by install in one invocation.
It guarantees no cross-version residue even when the manifest has drifted or been lost -- a belt-and-suspenders complement to the per-run orphan prune, which already deletes paths a new version stopped producing but cannot recover a lost manifest.

### Confirmation gate

The plan is always printed before any write or delete.
Then:

| Condition | Behavior |
| --- | --- |
| `--dry-run` | print plan, exit `0`, write nothing |
| `--yes` | print plan, apply without prompting |
| stdin is a TTY, no `--yes` | print plan, prompt `y/N`; apply only on `y` |
| stdin is not a TTY, no `--yes` | print plan, apply (preserves the zero-friction `npx` one-liner and CI) |

Confirmation is a safety-floor gate that does not depend on interaction mode (#ai-tool-safety).

### Interactive wizard

Bare `agentsmith` on a TTY runs the full wizard: verb (install / uninstall) -> scope (project / user / directory path) -> then, **only on the install path**, content mode (split / single) -> placement (root / nested) -> tool adapters (yes / no) -> dev adapters (yes / no); the uninstall path skips the four install-only prompts and goes straight from scope to the plan -> print the resulting plan -> confirm.
The wizard produces the same `{ command, scope, flags }` a parsed command line would, then flows through the identical plan/confirm/execute path -- the wizard is an input source, not a second code path.

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
- `README.md` Usage: rewrite for subcommands; the documented one-liner becomes `npx github:viniciussegura/agentsmith install`.
- `CONTRIBUTING.md`: `node bin/cli.js --dev` -> `node bin/cli.js install --dev`.
- `docs/technical-debts/2026-06-02-stale-user-import.md`: revisit -- uninstall now removes its own marked import via `userUnimport`, which narrows or closes that debt.

## Testing

Unit tests (single documented harness, `node --test`):

- `src/args.js`: each subcommand parses; unknown flag exits non-zero; conflicting scope value rejected; `--scope PATH` recognized; value-taking flags skip their value during unknown detection.
- `src/plan.js`: install plan for project / user / PATH scope; `--no-tools` emits `unmergeSettings` (bug-2 regression); uninstall plan lists all manifest paths + unmerge + unimport; `--clean` composes uninstall then install.
- `src/userimport.js`: `userUnimport` removes exactly the marked block and is a no-op when absent; round-trips with `userImport`.
- `settings.js`: `mergeSettings(existing, {})` drops owned entries and preserves user entries (the un-merge path).
- `sourceRevision()`: falls back to `package.json` version when git is unavailable.
- Confirmation gating: injected `isTTY` + prompt seam -- no real stdin; assert apply/skip per the table.

Every bug fix starts with a failing test that reproduces it (#swe-testing): the `----no-tools`-style unknown flag exiting `0`, and the stale hook entry after a `--no-tools` run.

## Docs drift

- `README.md` -- CLI Usage section (subcommands, axes, new one-liner).
- `CONTRIBUTING.md` -- `--dev` invocation.
- `docs/technical-debts/2026-06-02-stale-user-import.md` -- narrowed/closed by `userUnimport`.
- `docs/working-specs/INDEX.md` -- regenerated (`agentsmith spec-index`).
- No `docs/reference-spec/` or `docs/design-decisions/` file currently documents the CLI; none needs editing.

## Risks and open questions

- **Breaking bare invocation.** Any external script relying on bare `npx github:...` for a silent project install breaks and must add `install`. Accepted, pre-1.0, documented as a major note.
- **Wizard scope.** The full wizard is six prompts; if that feels heavy in practice, prompts can be trimmed later without touching the plan/execute path.
- **`--out` removal.** Confirmed zero in-repo consumers; an undocumented external user of `--out` would lose it. Accepted given `--scope PATH` covers the case.
