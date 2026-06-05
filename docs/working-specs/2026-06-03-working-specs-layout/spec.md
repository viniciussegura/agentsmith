# Spec: Working-spec layout and lifecycle

Date: 2026-06-03
Status: Implemented

## Motivation

Specs and plans currently live in two flat sibling directories, `docs/specs/` and `docs/plans/` (#ai-plan).
Three problems follow.
The directories grow without bound and feel cluttered.
A spec and the plan it generated sit apart, linked only by a shared filename that is fragile once their creation dates diverge.
And there is no clear way to tell which specs still describe the system as it is.

The fix reframes the model rather than patching it.
A spec or plan written in a conversation is a **point-in-time artifact**: it records what we intended to build on a given day, and it never changes meaning afterward.
Treating these artifacts as immutable history dissolves the validity problem at the source -- you never consult an old spec to learn what the system does now, so whether it is still "valid" stops mattering.
The current-truth question is answered elsewhere, by a living reference spec, which is **Move B** and out of scope here.

This spec is **Move A**: relocate and co-locate the working artifacts, and give them a minimal lifecycle marker.

## Goals

- One directory per logical unit of work, holding its spec and the plan it generated together.
- Co-location survives diverging creation dates between a spec and its plan.
- A spec or plan carries a minimal lifecycle status, readable at a glance.
- The flat `docs/specs/` and `docs/plans/` directories are retired and their contents migrated, including the two `docs/superpowers/` artifacts.
- Every instruction and tool reference to the old paths is updated in the same change.

## Non-goals

- The living reference spec (`docs/reference-spec/`) and moving `entity-model.md` into it -- that is Move B, specified separately.
- Cross-spec supersession tracking (`superseded-by`) -- deliberately dropped; the reference spec, not a chain of links, will carry current truth.
- A `<YYYY>` or `<YYYY>/<MM>` folder shard -- YAGNI at current volume; revisit only when a single directory grows unwieldy.
- Rewriting the body or authoring style of migrated artifacts (e.g. the superpowers checkbox-plan format); only the header block is normalized (see Migration -- normalization policy), and bodies move verbatim.
- Chasing internal cross-references inside migrated artifacts; stale links in frozen history are accepted as point-in-time (see Migration -- normalization policy).

## Design

### Directory layout

A logical unit of work owns one directory:

```
docs/working-specs/<YYYY-MM-DD>-<slug>/
    spec.md
    plan.md
```

The directory name is `<YYYY-MM-DD>-<slug>`, where the date is the unit's inception date (the spec's, or the plan's if there is no spec) and the slug names the unit.
The directory may hold only `spec.md` (no plan yet) or only `plan.md` (trivial work that skipped a spec).
Because both files share one directory, a spec and its plan stay adjacent no matter when each was written, and the old "same slug in two trees" coupling is gone.

### Lifecycle status

Each file carries a canonical header block: a title line (`# Spec: <title>` or `# Plan: <title>`), a `Date:` line, and a `Status:` line.
The `Status:` value is exactly one bare token -- no trailing punctuation, no parenthetical -- from:

- `Draft` -- written, not yet approved.
- `Approved` -- approved to build (for a spec) or to execute (for a plan).
- `Implemented` -- the work has landed.

A plan's prior `Spec:`/`Date:` lines and a spec's `Date:` line are retained; only the `Status:` line is constrained to the token set.
This is a per-artifact lifecycle marker only.
It says nothing about whether the artifact still matches the current system; that is the reference spec's job (Move B).

### Immutability

A working spec or plan is append-only history once `Approved`.
Later corrections to the live system are reflected in the reference spec, not by editing the artifact that predates them.
The one-time migration below is a normalization event, not a post-approval edit, and is exempt from this rule.

## Migration

### Normalization policy

Migration is a one-time normalization event with a fixed, narrow mutation budget per file:

- **Mechanic.** Each file is relocated with `git mv` (or equivalent add-new / rm-old), then the header normalization is applied in place at the new path. Move first, edit at the destination, so `git ls-files` reflects only the new paths.
- **Header block only.** Ensure a `# Spec: <title>` / `# Plan: <title>` title line, a `Date:` line (the date in the filename), and a `Status:` token line exist and are canonical. Files missing any of these get them added; non-canonical forms are rewritten (see status mapping). Where a file already has a top-level `#` heading (e.g. the two superpowers files), that existing heading line is **replaced** by the canonical title line -- not duplicated above an orphaned old heading. This heading replacement is the single permitted exception to "body verbatim".
- **Body verbatim.** Everything below the header block moves unchanged -- including the superpowers checkbox-plan format and every internal cross-reference. Stale links to old paths are accepted as point-in-time history and are **not** chased or rewritten. This supersedes the earlier single-cross-reference fix.

### Move table and status mapping

Move each file into its per-unit directory and set its `Status:` token per this mapping (all eight legacy artifacts have shipped, so all map to `Implemented`; this spec's own unit is handled in Bootstrap below):

| From | To | Header action |
|---|---|---|
| `docs/specs/2026-05-27-folder-mapped-instruction-sections.md` | `docs/working-specs/2026-05-27-folder-mapped-instruction-sections/spec.md` | `Status: draft, awaiting approval.` -> `Status: Implemented`; strip trailing period on `Date:` |
| `docs/plans/2026-05-27-folder-mapped-instruction-sections.md` | `docs/working-specs/2026-05-27-folder-mapped-instruction-sections/plan.md` | no `Date:`/`Status:` -- add both (`Status: Implemented`) |
| `docs/specs/2026-05-30-spec-auto-review.md` | `docs/working-specs/2026-05-30-spec-auto-review/spec.md` | `Status: Approved; implemented (plan ...)` -> `Status: Implemented` |
| `docs/plans/2026-05-30-spec-auto-review.md` | `docs/working-specs/2026-05-30-spec-auto-review/plan.md` | no `Status:` -- add `Status: Implemented` |
| `docs/specs/2026-06-02-user-scope-instructions.md` | `docs/working-specs/2026-06-02-user-scope-instructions/spec.md` | `Status: Approved; implemented (plan ...)` -> `Status: Implemented` |
| `docs/plans/2026-06-02-user-scope-instructions.md` | `docs/working-specs/2026-06-02-user-scope-instructions/plan.md` | no `Status:` -- add `Status: Implemented` |
| `docs/superpowers/specs/2026-05-25-on-demand-instruction-bundles-design.md` | `docs/working-specs/2026-05-25-on-demand-instruction-bundles/spec.md` | no canonical header -- retitle `# Spec: On-demand instruction bundles`, add `Date: 2026-05-25`, `Status: Implemented` |
| `docs/superpowers/plans/2026-05-25-on-demand-instruction-bundles.md` | `docs/working-specs/2026-05-25-on-demand-instruction-bundles/plan.md` | no canonical header -- retitle `# Plan: On-demand instruction bundles`, add `Date: 2026-05-25`, `Status: Implemented` (checkbox body untouched) |
| `docs/specs/2026-06-03-working-specs-layout.md` (this spec) | `docs/working-specs/2026-06-03-working-specs-layout/spec.md` | see Bootstrap |

The superpowers pair had mismatched slugs (`...-design` for the spec, `...-instruction-bundles` for the plan); the per-unit directory absorbs the mismatch, and both become `spec.md` / `plan.md` under one folder.
Per the normalization policy, the superpowers plan's internal link to its old spec path is left verbatim as history, not repointed.
After migration, no files remain under `docs/specs/`, `docs/plans/`, or `docs/superpowers/`; since git does not track empty directories, "removal" means the trees hold no tracked files (verified below), not an on-disk `rmdir`.

### Bootstrap

This spec migrates itself.
It is authored at the old path while the old layout is still in force, then relocated to `docs/working-specs/2026-06-03-working-specs-layout/spec.md` as part of its own plan's execution.
Its `Status:` advances normally: `Draft` now, `Approved` once the user approves, `Implemented` after the plan lands; the plan for this unit lands as `docs/working-specs/2026-06-03-working-specs-layout/plan.md` with `Status: Implemented` -- committed as `Implemented` because the migration commit is itself the landing event for this unit.
The in-flight auto-review of this spec is unaffected -- its scratch stays under `.agentsmith/tmp/spec-review/` and is never migrated or committed.

## Reference updates

These are updated in the same change so no instruction points at a retired path:

- `instructions/core/ai.md` `#ai-plan`: this is the **living home** for the new rules -- this spec is frozen history and cannot be where agents read them. `#ai-plan` must gain, as normative text, all of:
  1. **Path/layout.** A unit of work lives at `docs/working-specs/<YYYY-MM-DD>-<slug>/`, holding `spec.md` and/or `plan.md`.
  2. **Single-file allowed.** The directory may hold only `spec.md` (no plan yet) or only `plan.md` (trivial work that skipped a spec).
  3. **Status token set.** Each file's `Status:` line is exactly one bare token: `Draft`, `Approved`, or `Implemented`.
  4. **Append-only.** A working spec or plan is immutable history once `Approved`; later corrections to the live system go to the reference spec (Move B), not back into the artifact.
- `instructions/core/ai.md` `#ai-spec-review`: "under `docs/specs/`" becomes "under `docs/working-specs/`".
- `tools/claude/commands/spec-review.md`: generalized rather than re-pointed -- the spec path comes from the caller (`$ARGUMENTS`), and the modified-file fallback clause (the file's only `docs/specs/` occurrence) is removed, so when no path is given the command asks which spec to review. After the edit no `docs/` path token remains in the command; the verification grep (below) is the check that confirms it. The tool becomes layout-agnostic and never needs touching on a future layout change.

No committed `AGENTS.md` to regenerate: the root `AGENTS.md` is a stub and the forged bundle under `.agentsmith/` is gitignored (`.gitignore`), built at install time from `instructions/`.
So `instructions/core/ai.md` is the only committed source of truth to edit; the emitted copy follows automatically.
The `spec-review` SKILL and the `spec-specialist` agent contain no path assumption (the command held the only hardcoded path), so they are deliberately left unchanged.

## Open questions

- None blocking; the reference-spec naming and `entity-model.md` relocation are deferred to the Move B spec.

## Verification

These commands assume a POSIX shell (the Bash tool); on PowerShell use the Grep tool or `rg` equivalents (`grep` is not native to Windows).

- `git ls-files docs/specs docs/plans docs/superpowers` returns empty -- no tracked files remain under the old trees.
- Every `To` path in the move table is a tracked file at its new location (`git ls-files docs/working-specs`).
- `grep -rn "docs/specs\|docs/plans\|docs/superpowers" instructions/ tools/` returns nothing.
- Every `Status:` line under the migrated tree conforms to the token set: `grep -rh '^Status:' docs/working-specs | grep -vE '^Status: (Draft|Approved|Implemented)$'` returns empty. Scoped to `docs/working-specs/**` so this unit's own in-flight `Status: Draft` (still at the old path pre-merge) is not a false positive; at merge its committed value is `Implemented`.
- `#ai-plan` contains the four normative clauses enumerated in Reference updates (path, single-file-allowed, status token set, append-only).
- No migrated unit is single-file (every unit ships a `spec.md` + `plan.md` pair), so the only-`spec.md` / only-`plan.md` rule is exercised only by `#ai-plan` text, not by this migration's data.
