# Installer prune: remove orphaned generated files

Status: Approved

## Problem

`bin/cli.js` and the adapter installer only ever **write/overwrite** — there is
no deletion anywhere in the generate or install path. So every generated
**directory** accretes orphans the moment a producing source is removed or
renamed: the old output file is never cleaned up.

Confirmed live this session: renaming the board skills (review-board →
code-review-board, etc.) left the old `.claude/skills/<old>/` directories and the
bare command files orphaned beside the new ones; they had to be removed by hand.

Surfaces that accrete orphans:

- **`.claude/` adapters** — a removed/renamed command, skill, or agent leaves its
  old file behind.
- **`.agentsmith/agents/<bundle>.md`** — a removed or renamed manifest section
  leaves its old bundle file behind.

Single-file outputs are **fine**: `.agentsmith/AGENTS.md` and the root `AGENTS.md`
are whole-file rewrites, so a removed *rule* simply vanishes from the regenerated
file. The problem is only **directories of per-unit files** (bundles, adapters).

## Goal

After any run, the project contains exactly the files the current sources
produce — no orphan from a prior run — **without ever deleting a file agentsmith
did not generate**. `.claude/` is shared with the consumer's own commands, skills,
and agents, so pruning must be precise, not a blunt directory clear.

## Conformance

- **Reference spec** / **design decisions** — unaffected; no entity or decision
  change.
- **Safety baseline** (`#ai-tool-safety`) — the prune is destructive, so it is
  bounded to paths agentsmith **recorded writing**; it never removes a path it did
  not generate. This is the central safety constraint of the design.
- **Divergence:** none.

## Design

### A. Install manifest

Each run writes a manifest of the paths agentsmith generated this run:
`.agentsmith/.install-manifest.json` (gitignored, per-machine).
```
{ version: 1, generatedAt: <iso>, paths: [<relative path>...] }
```
`paths` lists only files agentsmith **fully writes/owns** this run: the core, the
bundle files, the root stub, and every adapter file written under `.<ai>/`.

### B. Prune step

At the start of an install, before writing:

1. Read the previous manifest if present.
2. Compute this run's path set (the same list the writers will produce).
3. **Prune** = previous paths − current paths. For each pruned path: delete it
   **iff** it still exists and was in the previous manifest (so a consumer file
   that happens to share a name is never touched — it was never in our manifest).
4. Write the files (existing behavior).
5. Write the new manifest.

Empty parent directories left by a prune are removed (e.g. an emptied
`.claude/skills/<old>/`).

### C. Exclusions (never pruned, never in the manifest)

- **Merge targets** — `.claude/settings.json` is *merged*, not owned; it is never
  in the manifest and never pruned.
- **The root `AGENTS.md` stub** — written once and never clobbered; after creation
  it is consumer-owned. It is recorded as "created" but excluded from prune so a
  later run never deletes it.
- **`.agentsmith/` scratch and stores** (`tmp/`, `review-board/`, the worksheet)
  — runtime data, not generator output; out of the manifest.

### D. First run / missing manifest

No previous manifest → nothing to prune (the current behavior); just write the
manifest. A user who deletes the manifest loses one prune cycle (orphans from
before the deletion survive) but is never at risk — pruning only ever acts on
recorded paths.

## Non-goals

- **Not** touching npm's `_npx` cache — npm owns it; agentsmith writes no external
  cache of its own.
- **Not** pruning `.agentsmith/AGENTS.md` content (single-file rewrite already
  handles rule removal).
- **Not** a general "clean" command — pruning is an automatic, bounded part of a
  normal install.

## Success criteria

- After renaming/removing a section or an adapter file and re-running the
  installer, the old file is gone and no consumer-owned file is touched.
- A consumer file under `.claude/` that shares a name with nothing agentsmith
  generates survives every run (it is never in the manifest).
- `settings.json` and the root `AGENTS.md` stub are never deleted by a prune.
- Tests cover: prune removes a recorded orphan; prune spares an unrecorded
  same-name file; empty dir cleanup; missing-manifest first run; settings/stub
  exclusion.
