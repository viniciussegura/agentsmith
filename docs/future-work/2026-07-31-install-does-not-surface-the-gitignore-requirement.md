# `install` never mentions the gitignore requirement it depends on

Date: 2026-07-31

## What

`#ai-plan` states the working-spec store **MUST** be gitignored and is candid that "nothing in the generator does this for you". The requirement is carried by two documents -- that rule and the README's gitignore block -- and by nothing the product does or says.

A consumer who runs `agentsmith install` and does not read the README gets no signal. The rule text they now have installed says the store must be gitignored, but it is addressed to an agent reading `AGENTS.md`, not to the person running the installer, and it fires at the moment a spec is written rather than at the moment the store's absence from `.gitignore` matters.

## Why it matters

The failure is silent and lands in version control. `.agentsmith/specs/<branch>/` accretes one directory per unit of work, committed, on a project whose instruction set says it should not be -- which is the exact corpus accretion the ephemeral-working-specs change exists to remove. Nothing surfaces it until someone notices the directory in a diff.

Same shape as `2026-07-30-working-spec-store-has-no-deletion-actor.md`: a rule asserts a property of the environment and no mechanism establishes it. That note records the deletion half; this is the gitignore half. Both were raised on the same branch and the second was recorded there as "fixed", which overstated it -- what shipped was README prose, and prose is not enforcement.

The blast radius differs, though, and this one is worse. An un-deleted store is per-machine, gitignored, and read by nobody. An un-gitignored store is committed and shared.

## Options

1. **A line in the intended-effects plan.** `install` already prints its plan and, on a TTY without `--yes`, waits for confirmation. Append the paths that must be gitignored. Cheapest, no new flags or verbs, lands where the operator is already reading and already deciding.
2. **A check on `.gitignore`.** Read the target scope's `.gitignore`, and warn naming only the paths actually missing. Strictly better signal than option 1 -- silent when there is nothing to say -- at the cost of reading a file the installer does not currently touch, and of deciding what to do when there is no `.gitignore` at all.
3. **Write the entries.** Rejected here rather than deferred: `install` modifying `.gitignore` mutates a file the user owns and did not name, which is the kind of unrequested edit the plan-then-confirm design exists to avoid.

Option 2 is the recommendation, with option 1 as the fallback if reading `.gitignore` proves to complicate the scope resolution (`--scope user` has no meaningful `.gitignore` to check).

## Constraints

- Warn, never fail. A consumer may deliberately commit the store -- unwise, but their call, and `install` is not the place to enforce an instruction-set rule.
- Whatever ships must agree with the README block, which is currently the only enumeration of these paths. Two lists that can drift is the defect this note is about, one level up: prefer a single exported constant that the check reads and the docs cite.
- The enumeration must stay complete. It gained `.agentsmith/instruction-review/` and `.agentsmith/.install-manifest.json` on review after shipping with three of five paths.
- New user-facing output is public surface (`#swe-public-surface-docs`) and needs its docs in the same change.

## Provenance

Raised in the second review pass on the 2026-07-31 ephemeral-working-specs branch, as the standing risk after the finding batch was applied. Not fixed there: it is a behavior change to the install path, outside that unit's approved scope (`#ai-plan-deviation`).
