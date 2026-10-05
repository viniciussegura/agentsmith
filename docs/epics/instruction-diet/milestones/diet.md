# diet -- a core an agent can afford to load

Breaking for consumers: rules move between core and bundles and every rule's text changes.

## diet-1 `process-bundle`

**Outcome.** The process rules (`#ai-plan`, `#ai-plan-deviation`, `#ai-preflight`, `#ai-spec-review`, `#swe-branch-lifespan`, `#swe-epic`, `#swe-consolidation-audit`) ship as an on-demand bundle; the core keeps the swe, code, and git basics.
**Depends on.** --
**Blocks.** `tooling-rules`
**Acceptance.** The generated core lists the bundle among the on-demand ones and carries none of the moved rules' bodies.
**State.** planned

## diet-2 `tooling-rules`

**Outcome.** `#ai-review-engine`, `#ai-review-board`, `#ai-spec-review`, and `#ai-instruction-review` each state intent, human gate, and a pointer; the full protocol lives with the skills.
**Depends on.** `process-bundle`
**Blocks.** `rule-rewrite`
**Acceptance.** Each of the four rules is under the per-rule word cap and the skill documents carry every removed obligation.
**State.** planned

## diet-3 `rule-rewrite`

**Outcome.** Every rule keeps its obligations and loses its rationale, which moves to a design decision or is deleted; an obligation list diffed before and after shows nothing dropped.
**Depends on.** `tooling-rules`, `records-merge`
**Blocks.** `word-budget`
**Acceptance.** Every rule is under the per-rule cap, the core under the core cap, and the integrity and ownership tests pass.
**State.** planned

## diet-4 `word-budget`

**Outcome.** Tests fail when a rule exceeds its word cap or the generated core exceeds its total.
**Depends on.** `rule-rewrite`
**Blocks.** --
**Acceptance.** The suite includes both caps and passes.
**State.** planned

## diet-5 `more-hooks`

**Outcome.** The Claude adapter ships hooks that mechanically enforce rules an agent can otherwise ignore: committing on the default branch, force-push and hook-skipping flags, undated deferral markers.
**Depends on.** --
**Blocks.** --
**Acceptance.** Each hook has a test and both install paths wire it.
**State.** planned
