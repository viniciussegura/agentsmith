# Roadmap

One version.
Milestones run in this order, each shipping as its own branch.

| Order | Milestone | Depends on | Blocks |
| --- | --- | --- | --- |
| 1 | [`conformance`](milestones/conformance-own-rules.md) -- the repo obeys its own rules | -- | -- |
| 2 | [`records`](milestones/records-lean-docs.md) -- one records doc, a lean README, capped notes | -- | `diet` |
| 3 | [`diet`](milestones/diet-lean-core.md) -- process bundle, tooling rules shrunk, every rule rewritten under a word budget, more hooks | `records` | -- |

`records` precedes `diet` because the rule rewrite moves rationale into the records the merge settles, and the note cap is the first budget test.
`conformance` is independent and ships first because it is small.
