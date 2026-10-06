# Extend the vocabulary-regression lint beyond `instructions/`

## What

`test/instruction-integrity.test.mjs` guards removed vocabulary in the rule sources only.
The 2026-07-22 terminology audit found the drift real in `README.md`, `tools/`, `devtools/`, and `docs/future-work/` too; extend the guard to those scopes.

## Why it matters

A retired term reintroduced in a doc or a skill prompt is read by agents as current vocabulary, and nothing fails.

## Constraints

- Point-in-time records are exempt: the lint walks living documents, not the history they cite.
