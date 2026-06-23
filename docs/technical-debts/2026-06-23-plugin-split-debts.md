# Authoring-split + plugin: accepted limitations

Date: 2026-06-23

Two accepted limitations from the authoring-tool split (Q1) and the plugin packaging (Q2).

## Debt 1 — stale authoring tools in a pre-split consumer `.claude/`

A consumer who ran a pre-split `npx agentsmith` has the authoring tools (`instruction-review`/`instruction-apply` + their meta-agents) already written under `.claude/`. The new installer no longer writes them, but the adapter install **only writes its own files** — it never deletes — so those stale files remain on disk.

### Why accepted

Deleting files the installer did not create this run violates the non-destructive guarantee (the same reason `--user` never prunes a stale import — see [stale-user-import](2026-06-02-stale-user-import.md)). The stale files are inert in a consumer project (they no-op without `instructions/` + `bin/cli.js`).

### Cost / risk

Low: a few unused, inert files. No correctness impact. Manual cleanup if the user cares.

## Debt 2 — unenforced "pick one path for tooling" (hook double-wiring)

The `Agent` model-enforcement hook (`require-explicit-model.mjs`) is wired by the `npx` path via `settings.json` and by the plugin path via `tools/claude/hooks/hooks.json`. A user who installs the tools via *both* paths gets the hook wired twice, so it fires twice per `Agent` dispatch.

### Why accepted

Each firing is idempotent — both invocations independently check for a `model` and exit identically — so the effect is a duplicate check, not a malfunction. Enforcing exclusivity (detecting "the other path is already installed") is fuzzy and outside the installer's trust model; the README documents "pick one path for tooling" instead.

### Cost / risk

Negligible: one redundant hook process per dispatch on a misconfigured machine. Surfaced via the README note.

### Remediation sketch

If it bites, have the `npx` settings merge skip the hook when a plugin install is detected (or vice-versa) — but only on a reliable signal, never a guess.
