# Non-Claude user-global auto-wiring

## What

`--user` auto-wires only Claude Code: it appends an `@`-import of `~/.agentsmith/AGENTS.md` to `~/.claude/CLAUDE.md`.
Other tools with a user-global instruction location (Codex, Gemini) are not wired automatically; add their wiring once a second tool is a concrete target.

## Why it matters

The generated `~/.agentsmith/AGENTS.md` is portable text any tool can be pointed at, but a user on Codex or Gemini still wires the import by hand, so `--user` is fully self-contained for Claude only.

## Constraints

- Each tool's user-global config path and import syntax differ and must be confirmed per tool; do not speculatively encode unverified paths.
- Non-Claude support pairs a `tools/<ai>/` adapter (`2026-06-10-non-claude-adapters.md`) with that tool's wiring.
