# Plan: User-scope instructions for `--user`

Date: 2026-06-02
Spec: `docs/specs/2026-06-02-user-scope-instructions.md` (reviewed, converged at round 3)

## Overview

Make `--user` self-contained: write the generated instructions to `~/.agentsmith/`, install the adapter, and append a marked import block to `~/.claude/CLAUDE.md` only if absent.
Also lands the already-made `sourceRevision` stderr fix (silences the `npx` no-`.git` noise).
Pure logic in a new `src/userimport.js`; IO and branch wiring in `bin/cli.js`; tests and docs alongside.

## Step 0 -- sourceRevision stderr fix (done, uncommitted)

`bin/cli.js` `git` helper already gained `stdio: ['ignore','pipe','ignore']`. Keep it in this branch's commit.

## Step 1 -- `src/userimport.js` (pure)

`userImport(existingContent | null, targetPath) -> string | null`:

- Derive `importLine = "@" + targetPath` (targetPath already forward-slash normalized by the caller).
- Build the block: `<!-- agentsmith: generated user instructions -->\n${importLine}\n`.
- If `existingContent` is null -> return the block.
- Else scan lines for a match (detection predicate): a trimmed line equal to `importLine`, OR an `@`-line whose remainder (trimmed of whitespace incl. `\r`), when absolute, slash-normalizes to `targetPath`. Relative `@`-lines do not match.
  - Match found -> return `null` (no write).
  - No match -> return `existingContent` + separator (`\n\n` unless it already ends with `\n`, then `\n`) + block.

## Step 2 -- `bin/cli.js` wiring

- Add `import { homedir } from 'node:os'` is present; reuse.
- Reorder terminal branches to: `--stdout` (preview, no writes) -> `--user` -> default project write.
- `--user` branch:
  - `base = homedir()`.
  - Write `built.corePath` and each `bundle.path` via `writeAbs(resolve(base, path), ...)`.
  - Do **not** write `built.stub`.
  - Compute `target = resolve(base, built.corePath)` normalized to forward slashes; read `~/.claude/CLAUDE.md` if it exists; `const next = userImport(existing, target)`; if `next !== null`, `writeAbs(resolve(base, '.claude/CLAUDE.md'), next)`. This runs **before** `installAdapters(base)`.
  - `installAdapters(base)`.
  - Remove the now-false `--user --no-tools has nothing to install` stderr line.

## Step 3 -- Tests

- `test/userimport.test.js` (unit): null -> block; no import -> appends with separator, prior content intact; no-trailing-newline file -> blank-line separator, last line not fused; exact line / absolute `@`-line resolving to target -> null; comment-with-path / `...AGENTS.md.bak` superstring / relative `@../...` -> appends; CRLF file already importing -> null.
- `test/cli.test.js`:
  - Replace the existing `--user ... writes no AGENTS.md` test (its intent is now stale) with: `--user` writes `~/.agentsmith/AGENTS.md`, installs the adapter under `~/.claude/`, and creates `~/.claude/CLAUDE.md` with the import block; cwd gets no `.agentsmith/` or `AGENTS.md`.
  - Idempotency: a second `--user` run leaves `~/.claude/CLAUDE.md` unchanged (no duplicate block).
  - Non-destructive: a pre-existing unrelated `~/.claude/CLAUDE.md` line survives and the block is appended after it.
  - `--user --no-tools`: creates `~/.agentsmith/AGENTS.md` and `~/.claude/CLAUDE.md` (with import) but installs no adapter.
  - All via a child process with `HOME`/`USERPROFILE` set to a temp dir.

## Step 4 -- Docs

- `README.md`: rewrite the `--user` flag bullet (home instructions + adapter + `CLAUDE.md` import) and add a one-line migration note about removing a stale checkout import.
- `docs/future-work/2026-06-02-non-claude-user-wiring.md`: non-Claude user-global auto-wiring (#swe-future-work).
- `docs/technical-debts/2026-06-02-stale-user-import.md`: non-automated stale-import migration (#swe-technical-debts).
- Set spec status to Approved / implemented.

## Done criteria (#swe-done)

1. `npm test` passes.
2. Manual: `node bin/cli.js --user` with a throwaway `HOME` produces `~/.agentsmith/AGENTS.md`, adapter, and the `CLAUDE.md` import; a second run adds no duplicate.
3. README + spec status updated; future-work and technical-debt logged.
4. Self-review against the rule set.

## Risks / notes

- Windows `@`-import slash form is asserted, not yet runtime-proven; covered by the manual verification step and the technical-debt note (fallback to native path form if it bites).
- Reordering the CLI branches must not change non-`--user` behavior; the existing project/`--stdout`/`--no-tools` tests guard that.
