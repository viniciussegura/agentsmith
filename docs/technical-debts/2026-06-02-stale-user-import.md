# Non-automated stale-import migration

Date: 2026-06-02

## Debt

`--user` appends an import of `~/.agentsmith/AGENTS.md` to `~/.claude/CLAUDE.md`, but does not detect or remove a user's pre-existing import of a *different* path -- e.g. a local checkout (`@.../dev/agentsmith/.agentsmith/AGENTS.md`).
Both imports then load near-identical rules until the user removes the stale line by hand.

## Why accepted

Removing or rewriting user-authored lines violates the non-destructive guarantee (we never edit existing content in `~/.claude/CLAUDE.md`).
Auto-detecting "a stale agentsmith import" reliably is fuzzy (arbitrary checkout paths) and risks deleting a line the user wants.

## Cost / risk

Low: duplicate near-identical instructions loaded once per session (mild token waste), no correctness impact.
Surfaced to the user via the README migration note and the install log.

## Remediation sketch

If it proves annoying, add an opt-in `--prune-stale-imports` that lists candidate agentsmith-looking imports and removes them only on explicit confirmation -- never silently.
