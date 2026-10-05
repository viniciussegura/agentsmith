# diet -- a core an agent can afford to load

Breaking for consumers (`refactor!`): rules move between core and bundles and every rule's text changes.

## diet-1 `process-bundle`

**Outcome.** The process rules (`#ai-plan`, `#ai-plan-deviation`, `#ai-preflight`, `#ai-spec-review`, `#swe-branch-lifespan`, `#swe-epic`, `#swe-consolidation-audit`) ship as an on-demand `process` bundle; the core keeps the swe, code, and git basics.
**Depends on.** --
**Acceptance.** `agentsmith --stdout` lists the bundle in `#on-demand`; the core carries none of the moved tags' bodies.
**State.** planned

## diet-2 `tooling-rules`

**Outcome.** `#ai-review-engine`, `#ai-review-board`, `#ai-spec-review`, `#ai-instruction-review` each state intent, human gate, and a pointer; the full protocol lives in the skill directories.
**Depends on.** `process-bundle`
**Acceptance.** Each of the four rules is under the per-rule word cap; the skill documents carry every removed obligation.
**State.** planned

## diet-3 `rule-rewrite`

**Outcome.** Every rule module keeps its obligations and loses its rationale, which moves to a design-decision file or is deleted; an obligation list diffed before and after shows nothing dropped.
**Depends on.** `tooling-rules`, `records-merge`
**Acceptance.** Every rule under the per-rule cap; the core under the core cap; integrity and ownership tests green.
**State.** planned

## diet-4 `word-budget`

**Outcome.** Tests fail when a rule module exceeds its word cap or the generated core exceeds its total.
**Depends on.** `rule-rewrite`
**Acceptance.** `npm test` includes both caps and passes.
**State.** planned

## diet-5 `more-hooks`

**Outcome.** The Claude adapter ships hooks that mechanically enforce rules an agent can otherwise ignore: committing on the default branch, force-push and `--no-verify`, undated deferral markers.
**Depends on.** --
**Acceptance.** Each hook has a test; `settings.json` merge and plugin manifest wire them.
**State.** planned
