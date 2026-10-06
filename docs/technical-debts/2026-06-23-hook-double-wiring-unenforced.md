# Unenforced "pick one path for tooling": hook double-wiring

## The debt

The `Agent` model-enforcement hook (`require-explicit-model.mjs`) is wired by the `npx` path via `settings.json` and by the plugin path via `tools/claude/hooks/hooks.json`.
A user who installs the tools via both paths gets the hook wired twice, so it fires twice per `Agent` dispatch.

## Why accepted

Each firing is idempotent: both invocations independently check for a `model` and exit identically, so the effect is a duplicate check, not a malfunction.
Detecting that the other path is already installed is fuzzy and outside the installer's trust model; the README documents "pick one path for tooling" instead.

## Cost / risk

Negligible: one redundant hook process per dispatch on a misconfigured machine, and two copies of every command.

## Remediation sketch

If it bites, have the `npx` settings merge skip the hook when a plugin install is detected (or vice versa), but only on a reliable signal, never a guess.
