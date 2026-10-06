# Settle the diff-sense `change` / `diff` / `commit` vocabulary

## What

The 2026-07-22 terminology audit settled `change` as the done-gate subject but not its diff sense: `change`, `diff`, and `commit` are still used interchangeably across `instructions/` for the thing a review round examines.
Pick one word per sense and apply it in one audited pass.

## Why it matters

The set is installed by other projects, so each rename ships a vocabulary change to every consumer (`#swe-terminology`); a trickle of renames costs more than one pass.

## Constraints

- A project-level instruction file or session memory holding the old noun keeps it until regenerated.
