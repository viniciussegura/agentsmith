# Adapters for non-Claude tools under `tools/<ai>/`

## What

First-class adapters (the skills, commands, and agents equivalents) for other assistants, such as `tools/codex/` or `tools/gemini/`, mirroring `tools/claude/`.
Each carries its own packaging: Gemini and Codex do not consume Claude Code plugins, so each tool's namespacing and install story is per tool.

## Why it matters

Today non-Claude tools get only the review rules' intent and human gates from `AGENTS.md`; native adapters would give them the protocol itself, with real fan-out, verify, and reduce where their runtime supports it.

## Constraints

- The generator's `planToolInstall` already generalizes `tools/<ai>/` to `.<ai>/`, so the plumbing exists; the work is authoring each tool's native artifact format.
- Each adapter stays in lockstep with the portable protocol so the degradation tiers do not diverge.
- The abstraction (skills, commands, agents, hooks) is Claude-shaped; ChatGPT has no filesystem-skill model, so only the instruction text ports there.
- Defer until there is a concrete second-tool target; do not speculatively encode unverified formats.
