# Installing tooling by both paths double-wires the hooks, and nothing prevents it

## The debt

The four agentsmith hooks are wired by the `npx` path via `settings.json` and by the plugin path via `plugin.json`.
A user who installs the tools via both paths gets every hook wired twice, so each fires twice per matched tool call, and two copies of every command.

## Why accepted

Each hook is idempotent: both invocations read the same payload and reach the same verdict, so the effect is a duplicate check, not a different outcome.
Detecting that the other path is already installed is fuzzy and outside the installer's trust model; the README warns against mixing the two paths instead.

## Cost / risk

Negligible: one redundant hook process per matched call on a misconfigured machine, and duplicate commands.

## Remediation sketch

If it bites, have the `npx` settings merge skip the hooks when a plugin install is detected (or vice versa), but only on a reliable signal, never a guess.
