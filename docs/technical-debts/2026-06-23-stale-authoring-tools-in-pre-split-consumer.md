# Stale authoring tools in a pre-split consumer `.claude/`

## The debt

A consumer who ran a pre-split `npx agentsmith` has the authoring tools (`instruction-review`, `instruction-apply`, and their meta-agents) written under `.claude/`.
The installer no longer writes them, and the adapter install only writes its own files and never deletes, so those stale files remain on disk.

## Why accepted

Deleting files the installer did not create this run violates the non-destructive guarantee, the same reason `--user` never prunes a stale import.
The stale files are inert in a consumer project: they no-op without `instructions/` and `bin/cli.js`.

## Cost / risk

Low: a few unused, inert files with no correctness impact.

## Remediation sketch

Manual cleanup by the consumer: delete the authoring skills, commands, and meta-agents from `.claude/` by hand; the installer never will.
