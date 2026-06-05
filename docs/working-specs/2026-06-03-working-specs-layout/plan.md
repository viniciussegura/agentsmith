# Plan: Working-spec layout and lifecycle

Date: 2026-06-03
Spec: `spec.md` (approved)
Status: Implemented

Executes Move A of the approved spec.
The spec is the source of truth for the move table, status mapping, and normalization policy; this plan sequences the work and pins git mechanics.
All steps land on the current session branch (a feature branch off `main`, never `main` directly).

## Step 1 -- Migrate the eight legacy artifacts

For each `From -> To` row in the spec's move table (the eight legacy files, not this unit):

1. `git mv <From> <To>`, creating the `docs/working-specs/<YYYY-MM-DD>-<slug>/` directory.
2. Apply the row's Header action in place at the new path: ensure canonical `# Spec:`/`# Plan:` title, `Date:`, and `Status: Implemented` (bare token). Bodies stay verbatim; existing top-level `#` headings (the two superpowers files) are replaced, not duplicated; internal cross-references are left as-is (point-in-time history).

Resulting units: `2026-05-25-on-demand-instruction-bundles`, `2026-05-27-folder-mapped-instruction-sections`, `2026-05-30-spec-auto-review`, `2026-06-02-user-scope-instructions` -- each with `spec.md` + `plan.md`.

## Step 2 -- Migrate this unit (bootstrap)

1. `git mv docs/specs/2026-06-03-working-specs-layout.md docs/working-specs/2026-06-03-working-specs-layout/spec.md`; set its `Status:` to `Approved` -> `Implemented` as part of this same migration commit (the commit is the landing event).
2. `git mv docs/plans/2026-06-03-working-specs-layout.md docs/working-specs/2026-06-03-working-specs-layout/plan.md`; set its `Status:` to `Implemented`.
3. Fix the two intra-unit links so they resolve at the new paths: this plan's `Spec:` line -> `spec.md`, and the spec's self-references that name a path. (These are header/link lines in the live unit, distinct from frozen legacy bodies.)

## Step 3 -- Rewrite `#ai-plan` (the living home)

In `instructions/core/ai.md`, replace the two `#ai-plan` bullets with normative text carrying all four clauses from the spec's Reference updates:

1. Path/layout: `docs/working-specs/<YYYY-MM-DD>-<slug>/` holding `spec.md` and/or `plan.md`.
2. Single-file allowed (spec-only or plan-only directory).
3. Status token set: `Draft | Approved | Implemented` (bare token).
4. Append-only once `Approved`; live-system corrections go to the reference spec (Move B).

Keep the existing "non-trivial changes start with a user-approved spec" rule.

## Step 4 -- Update the remaining references

1. `instructions/core/ai.md` `#ai-spec-review`: `docs/specs/` -> `docs/working-specs/`.
2. `tools/claude/commands/spec-review.md`: remove the modified-file fallback clause (the file's only `docs/specs/` occurrence); when no path is given, the command asks which spec to review. Confirm no `docs/` path token remains.
3. Leave the `spec-review` SKILL and `spec-specialist` agent unchanged (no path assumption).

## Step 5 -- Confirm old trees hold no tracked files

After the moves, `docs/specs/`, `docs/plans/`, and `docs/superpowers/` should contain no tracked files (git does not track empty dirs; no `rmdir` needed).

## Step 6 -- Verify

Run the spec's Verification block (POSIX shell / Grep tool on this Windows env):

- `git ls-files docs/specs docs/plans docs/superpowers` -> empty.
- `git ls-files docs/working-specs` -> every `To` path present.
- `grep -rn "docs/specs\|docs/plans\|docs/superpowers" instructions/ tools/` -> nothing.
- `grep -rh '^Status:' docs/working-specs | grep -vE '^Status: (Draft|Approved|Implemented)$'` -> empty.
- `#ai-plan` contains the four clauses.

## Out of scope

Move B (`docs/reference-spec/`, `entity-model.md` relocation) -- separate spec.

## Verification of done (#swe-done)

- Verification block passes.
- Docs drift: `#ai-plan`, `#ai-spec-review`, the spec-review command updated in this change; no other doc references the old paths.
- No new dependencies; no shortcuts to record.
- Self-reviewed against the instruction set.
