# Spec: User-scope instructions for `--user`

Date: 2026-06-02
Status: Approved; implemented (plan `docs/plans/2026-06-02-user-scope-instructions.md`)

## Motivation

`--user` installs the Claude adapter into `~/.claude/` but writes no instructions, on the assumption that the `#ai-spec-review` and other rules reach user scope through an `@`-import the user already has in `~/.claude/CLAUDE.md`.
That assumption breaks for an `npx`-only setup: the existing import points at a local checkout (`@T:\dev\agentsmith\.agentsmith\AGENTS.md`), which does not exist on a machine that never cloned the repo.
So a fresh `npx ... --user` installs tooling whose governing rules silently never load.
`--user` should be self-contained: drop the generated instructions in a stable home location and wire them up, without clobbering user-owned files.

## Goals

- `npx ... --user` on a clean machine leaves a working user-global setup: the instruction rules load in every Claude Code session, and the adapter is installed.
- Non-destructive: never rewrite or reorder existing content in `~/.claude/CLAUDE.md`; only append our import block if it is absent.
- Idempotent import: re-running `--user` never duplicates the `CLAUDE.md` import block. (The generated `~/.agentsmith/` and adapter files are rewritten each run, exactly as in project scope; only the import block is append-once.)

## Non-goals

- User-global wiring for non-Claude tools (Codex, Gemini); the generated home file is portable text they can point at, but auto-wiring their config is out of scope (the adapter is already Claude-specific).
- Removing or migrating a user's pre-existing stale import (see Edge cases); we never delete user content.

## Behavior

Under `--user`, the write base for every generated output changes from the current working directory to the user's home directory (`os.homedir()`), and the root `AGENTS.md` stub is replaced by a `CLAUDE.md` import. Concretely:

1. **Flag precedence** -- `--stdout` is checked **before** `--user`: `--stdout` remains a no-write preview of the core and ignores `--user`. The CLI must order the branches `--stdout` first, then `--user`, then the default project write. (Today `userScope` is checked first; this reorder is part of the change.)
2. **Instructions** -- write the generated core to `~/.agentsmith/AGENTS.md`, and, in the default lean layout, the on-demand bundles to `~/.agentsmith/agents/*.md`.
   This reuses the existing nested-layout build unchanged: `built.corePath` is already `.agentsmith/AGENTS.md` and each `bundle.path` is already `.agentsmith/agents/<name>.md`, so each output path is `resolve(homedir(), <path>)` -- no extra `.agentsmith/` segment is prepended.
   `--full` still produces the single inlined `~/.agentsmith/AGENTS.md` (no bundles).
3. **Stub suppression** -- `buildOutputs` is unchanged and still returns a `stub` for nested placement; under `--user` the CLI simply does **not** write `built.stub`. The `CLAUDE.md` import (below) takes its place.
4. **Adapter** -- install `tools/<ai>/**` into `~/.<ai>/**` via `resolve(homedir(), <dest>)`, where `dest` already contains `.<ai>/` from `planToolInstall` (unchanged from current `--user`).
5. **Import wiring** -- ensure `~/.claude/CLAUDE.md` imports the home instructions (see below).

### Import block

The block, created or appended:

```
<!-- agentsmith: generated user instructions -->
@<home>/.agentsmith/AGENTS.md
```

- `<home>` is `os.homedir()` with forward slashes (e.g. `C:/Users/you/.agentsmith/AGENTS.md`). Forward slashes are used uniformly so the same form is written and matched on every platform; the install logs the exact path so the user can adjust if their host needs a different form.
- **Wiring rules:**
  - All wiring writes create `~/.claude/` if absent (recursive mkdir), independent of the adapter step, so `--user --no-tools` still produces a valid file.
  - File absent -> create `~/.claude/CLAUDE.md` containing the block.
  - File present, no line importing our home file -> append the block, guaranteeing a blank-line separator first (insert `\n\n` if the file does not already end in a newline) so the marker never fuses onto an existing line.
  - File present and already importing our home file -> no change.
  - The written block always ends with a single trailing `\n`.
- **Detection predicate (idempotency key):** a line whose trimmed text equals the import line `@<home>/.agentsmith/AGENTS.md`, OR a line starting with `@` whose remainder -- trimmed of surrounding whitespace, including a trailing `\r` (CRLF files) -- when it is an **absolute** path, slash-normalizes to that absolute path. Relative `@`-imports (e.g. `@../.agentsmith/AGENTS.md`) are treated as non-matching -- we append, which is acceptable. Substring scans are not used, so a comment mentioning the path or a superstring (`...AGENTS.md.bak`) does not false-match. The marker comment is cosmetic, not the match key.

## Edge cases

- **`--user --root` / `--user --out <path>`** -- `--user` forces the nested home layout; `--root` and `--out` are ignored under `--user` (the home instruction path is fixed at `~/.agentsmith/AGENTS.md` so the import block always points at a file that was written). The CLI logs that they were ignored.
- **`--user --no-tools`** -- writes the instructions and the import wiring; only the adapter is skipped. The current CLI stderr line "`--user with --no-tools has nothing to install`" becomes false and is removed.
- **`--user --stdout`** -- `--stdout` wins (preview core, no writes); `--user` ignored. See Behavior 1.
- **Stale checkout import** -- a user may already have `@...\dev\agentsmith\.agentsmith\AGENTS.md` (a local-clone path). It does not resolve to our home path, so it does not match the detection predicate; we append our home import alongside it, and both may load near-identical rules. We do not touch the stale line; the user removes it if they wish (logged as a migration note).

## Implementation sketch

- New pure helper `src/userimport.js`: `userImport(existingContent | null, targetPath) -> string | null`, deriving the import line as `@${targetPath}` internally (one source of truth). The CLI passes `targetPath` as the home `AGENTS.md` path already normalized to forward slashes (`resolve(...)` then replace `\\` with `/`); the helper normalizes candidate `@`-lines the same way before comparison. Returns `null` (signal: no write needed) when a line already matches the detection predicate; otherwise returns the full new file content (the block alone if `existingContent` is null, else `existingContent` + separator + block, ending in `\n`). No disk access.
- `bin/cli.js`:
  - Reorder the terminal branches to `--stdout`, then `--user`, then default.
  - In the `--user` branch: `base = homedir()`; write `built.corePath` and each `bundle.path` via `writeAbs(resolve(base, path), ...)`; do not write `built.stub`; wire `~/.claude/CLAUDE.md` (read if present, call `userImport`, write via the dir-creating `writeAbs` only if non-null) **before** `installAdapters(base)`, so a later adapter-file error cannot leave instructions written but unwired.
  - Remove the now-false `--user --no-tools` stderr message.

## Tests

- Unit (`src/userimport.js`):
  - missing file (null) -> returns the block.
  - file lacking the import -> returns prior content + separator + block, with prior content intact.
  - file lacking a trailing newline -> appended block is separated by a blank line, last existing line not fused.
  - file already importing the home path (exact line, and absolute `@`-line resolving to it) -> returns null.
  - a comment line containing the path, a `...AGENTS.md.bak` superstring, or a relative `@../.agentsmith/AGENTS.md` line -> does NOT match (still appends).
  - a CRLF file already importing the home path (line ends with `\r`) -> returns null (no duplicate append).
- CLI (`test/cli.test.js`): launch the CLI as a child process with `HOME`/`USERPROFILE` overridden to a temp dir (matching how `os.homedir()` resolves; it cannot be monkeypatched in-process for the executed `bin/cli.js`). Assert: `~/.agentsmith/AGENTS.md` written; adapter installed under `~/.claude/`; `~/.claude/CLAUDE.md` created with the block; a second run adds no duplicate; a pre-existing unrelated `~/.claude/CLAUDE.md` line survives. Also assert `--user --no-tools` creates both `~/.agentsmith/AGENTS.md` and `~/.claude/CLAUDE.md` (with the import) but installs no adapter.

## Verification

- `npm test` green.
- Manual: `node bin/cli.js --user` with a throwaway `HOME`, inspect the three artifacts and the import block; run twice to confirm the import is not duplicated.
- Manual (Windows): confirm Claude Code resolves the forward-slash absolute `@`-import; if it does not, fall back to the host's native path form (recorded as a follow-up if it bites).

## Docs drift

- README `--user` flag: update from "write nothing else" to the new behavior (home instructions + adapter + `CLAUDE.md` import), with a one-line migration note about removing a stale checkout import.
- `docs/future-work/`: log non-Claude user-global auto-wiring (out-of-scope, deferred) per `#swe-future-work`.
- `docs/technical-debts/`: log the non-automated stale-import migration (an accepted limitation of this change) per `#swe-technical-debts`.
