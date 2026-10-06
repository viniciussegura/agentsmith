# The `targetRef: 'main'` schema enum names a branch, not a role

## What

`docs/reference-spec/entity-model.md` types a round's `targetRef` as `'main' | 'feature-branch'`, so a repo whose default branch is not `main` carries a misnamed literal.
Rename the literal to the role it names (`default-branch`), with a value backfill over existing `rounds/*.json` or a dual-literal lookup in the round-chaining step of `SKILL.md` Setup.

## Why it matters

The instruction set avoids `main` as a rule referent (`#git-branch-workflow` says "the default branch"); the one place the literal survives is a schema an agent reads as truth.

## Constraints

- An entity-model change first (`#swe-entity`), then the store backfill; no script reads the field, so neither lint nor persist changes.
- Blocked on deciding backfill versus dual-literal lookup.
