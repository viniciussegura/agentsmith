# Migrate `#local-verify-the-gate` into the shipped instruction set

## What

`#local-verify-the-gate` lives in the root `AGENTS.md` under *Local rules*, project-scoped and never generated into the shipped set.
Promote it to `instructions/core/ai/ai-verify-the-gate.md` so it loads in every consumer's core: rename the tag (`#local-` marks a repo-scoped rule and cannot ship), add its `ownership.yaml` row under the `ai` lens, generalize the two repo-local passages (the provenance line citing this repo's audit, and the note about `grep` builds on this machine) while keeping the substance that a near-variant pattern is not the pattern, and delete the local rule rather than leave a second copy (`#swe-reuse`).
Decide at the same time whether anything mechanical can carry part of the load, such as pasting gate commands with their exit status rather than as prose.

## Why it matters

Nothing in the rule is agentsmith-specific: it names a general failure of agent honesty, a written claim about verification that was never performed, and it is what makes `#swe-done` item 2 and `#git-pr`'s untestable-exception line mean anything, since both are satisfiable today by stating a verification that never ran.
Intent and reality render as identical prose, so nothing in the act of writing prompts the switch into verification; the cost is a tool call now against a review round later.

## Constraints

- Migration fixes discoverability and reach, not enforceability: the rule stays unverifiable prose with no hook, test, or lint, and its silent failure mode is worth naming in the rule text if no mechanism is added.
- A change to the shipped set needs its own working spec (`#ai-plan`): it introduces public surface (a new `#tag`) and touches more than one file.
- The tag must not collide with a review-board lens id or an existing `#ai-*` tag; the new text is subject to the instruction-integrity gates (no dangling references, exactly one owner).
