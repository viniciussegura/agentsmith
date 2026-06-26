---
description: Grade the current change against this project's instruction set (AGENTS.md) in one fast single-agent pass.
argument-hint: [<branch>]
---

Run a lightweight instruction-conformance pass over the current change. Arguments: $ARGUMENTS

Use the `instruction-check` skill. An optional `<branch>` names the feature branch to grade (default: the current branch vs the configured default branch, or the uncommitted working + staged changes when there is no feature branch).

Locate the generated rubric (`AGENTS.md` / `.agentsmith/AGENTS.md`), scope the diff, grade the changed surface against the instruction `#tags` one finding per line, and present a terse verdict. Single agent, no persistence -- this is the light tier between `#swe-done` self-review and the full `/code-review-board`. Offer `/code-review-board` if the change warrants the heavier pass.
