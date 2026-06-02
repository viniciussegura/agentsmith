# Non-Claude user-global auto-wiring

Date: 2026-06-02

## What

`--user` auto-wires only Claude Code: it appends an `@`-import of `~/.agentsmith/AGENTS.md` to `~/.claude/CLAUDE.md`.
Other tools with a user-global instruction location (e.g. Codex, Gemini) are not wired automatically.

## Why it matters

The generated `~/.agentsmith/AGENTS.md` is portable text any tool can be pointed at, but a user on Codex or Gemini still has to wire the import by hand, so `--user` is only fully self-contained for Claude.

## Constraints / dependencies

- Each tool's user-global config path and import syntax differ and must be confirmed per tool.
- The adapter (`tools/claude/`) is already Claude-specific; non-Claude support would pair a `tools/<ai>/` adapter with that tool's wiring.
- Defer until there is a concrete second-tool target; do not speculatively encode unverified paths.
