# The review-board persist gate validates by hand, field by field

Date: 2026-10-05

## What

`persist.mjs` guards its scratch inputs (round record, findings, PM directive) with four hand-written validators, each a list of per-field checks, while `lint.mjs` re-checks the written store with a fifth and `round-args.mjs` already declares `ROUTING_SCHEMA` as a JSON-Schema object.
Replace the hand-rolled checks with one declarative schema per scratch artifact, validated by a single small validator shared by the gate and the lint.

Edges the hand-rolled gate still leaves open, to be closed by the schema rather than one at a time:

- a PM priority override without a `rationale` overwrites the required `priorityRationale` with nothing;
- directive ids are not resolved -- a mistyped `canonical` fails only at post-write lint, and an override, rejection, or duplicate naming no accepted finding is a silent no-op;
- the same accepted id in two findings files writes twice and lint sees one file;
- whitespace-only strings count as present in the gate but not in `lint.mjs`;
- a non-string id is reported twice;
- directive ids outside `epics` (overrides, duplicates, rejections) are not resolved against the accepted findings;
- a finding's id role is not matched to the findings file it came from, so `swe.json` may carry a `qa` id.

## Why it matters

Three review passes on one branch each found further edges of the hand-rolled gate: unknown fields, round-id agreement, type and enum checks, closed-state fields, the directive.
Every edge is cheap to add and the list never ends, because each check is a sentence of code rather than a line of schema.
A schema also gives `issue-format.md` something to be generated from, or checked against, instead of a prose twin that drifts.

## Constraints

- Zero dependencies: `persist.mjs` ships to consumers and promises `JSON.parse`/`JSON.stringify` only, so the validator is in-repo, covering only the subset of JSON Schema the artifacts need.
- The gate's split stays: an accepted malformed finding halts before any write, a rejected one warns.
- `lint.mjs` and the gate must consume the same schema, or the two drift the way the sentinel forms did.
