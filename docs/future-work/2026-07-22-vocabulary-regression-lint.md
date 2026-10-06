# A vocabulary-regression lint over the living documents

## What

No lint guards retired vocabulary in general.
`test/instruction-integrity.test.mjs` checks two literal tokens (`working-specs`, `spec-index`) across `instructions/`, `tools/`, and the generated core, and nothing checks `README.md`, `docs/`, or `devtools/`, where the 2026-07-22 terminology audit found the drift real.
Add a retired-term list with one scope per term, walked over the living documents, so a rename settled by an audit stays settled.

## Why it matters

A retired term reintroduced in a doc or a skill prompt is read by agents as current vocabulary, and nothing fails.

## Constraints

- Point-in-time records and deliberate residuals (a removed-commands table, a changelog upgrade step) are exempt per term, the way the two-token test exempts `docs/` today.
