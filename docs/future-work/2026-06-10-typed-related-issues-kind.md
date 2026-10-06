# Typed `relatedIssues` relation kind and acyclicity checks

## What

Replace or supplement the free-text `relatedIssues[].description` with a typed `kind` enum (`child-of`, `duplicate-of`, `superseded-by`, ...), so the store linter (`tools/claude/skills/code-review-board/lint.mjs`) can build a relation graph and detect supersession and duplication cycles.

## Why it matters

The linter validates `relatedIssues` referential integrity but cannot check acyclicity: with the relation encoded in prose, a generic cycle check would false-positive on legitimate bidirectional links (epic to child).
A typed kind makes "no superseded-by cycle" mechanically enforceable, closing the one integrity gap `issue-format.md` calls out.

## Constraints

- A schema change to `RelatedIssue` in `issue-format.md`, and to the entity model if the relation becomes a core concept; a migration note for existing stores.
- The linter gains a directed-graph pass per relation kind.
