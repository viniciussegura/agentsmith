# `review-qa` grades test health without being able to run the tests

Date: 2026-10-05

## What

The `review-qa` reviewer declares `tools: Read, Grep, Glob, Write` and no execution tool, so the lens that judges "do the tests hold" grades from a static reading of the test sources.
Give it a scoped way to run the project's documented test command (`#swe-testing`) and read the result.

## Why it matters

A QA verdict that never executed anything is the lens asserting what it could not observe.
The round of 2026-08-11 graded from a static trace; a failing suite would have passed the lens.

## Constraints

- Reviewers are read-only by design so the containment guard (`round-guard.mjs`) stays meaningful; any execution tool is scoped to the test command, never a general shell.
- Every other reviewer persona keeps the read-only tool set.
- Recorded on closing the 2026-08-11 role-field note, which carried this as an observation.
