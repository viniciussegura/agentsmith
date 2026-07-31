# `install` never mentions the gitignore requirement it depends on

Date: 2026-07-31

## What

`#ai-plan` states the working-spec store **MUST** be gitignored and is candid that "nothing in the generator does this for you". The requirement is carried by two documents -- that rule and the README's gitignore block -- and by nothing the product does or says.

A consumer who runs `agentsmith install` and does not read the README gets no signal. The rule text they now have installed says the store must be gitignored, but it is addressed to an agent reading `AGENTS.md`, not to the person running the installer, and it fires at the moment a spec is written rather than at the moment the store's absence from `.gitignore` matters.

## Why it matters

The failure is silent and lands in version control. `.agentsmith/specs/<branch>/` accretes one directory per unit of work, committed, on a project whose instruction set says it should not be -- which is the exact corpus accretion the ephemeral-working-specs change exists to remove. Nothing surfaces it until someone notices the directory in a diff.

Same shape as `2026-07-30-working-spec-store-has-no-deletion-actor.md`: a rule asserts a property of the environment and no mechanism establishes it. That note records the deletion half; this is the gitignore half. Both were raised on the same branch and the second was recorded there as "fixed", which overstated it -- what shipped was README prose, and prose is not enforcement.

The blast radius differs, though, and this one is worse. An un-deleted store is per-machine, gitignored, and read by nobody. An un-gitignored store is committed and shared.

## What the README fix already changed

The README block was originally an enumeration of the working-state paths -- default-allow, requiring the list to stay complete against a set that grows. It shipped missing two of five. It has since been inverted to deny-by-default, in the two forms a consumer can actually be in:

```gitignore
.agentsmith/                 # not committing the generated instructions
```

```gitignore
.agentsmith/*                # committing them
!.agentsmith/AGENTS.md
!.agentsmith/agents/
```

(The `/*` is load-bearing: git will not re-include a file whose parent directory is excluded, so `.agentsmith/` paired with `!` exceptions silently ignores the core too. Verified both forms against a scratch repo.)

That removes the drift risk entirely -- there is no longer a list of scratch paths to keep current, and a working-state directory added by a future version is covered without any consumer editing anything. What it does not do is reach a consumer who never reads the README.

## Options

1. **A line in the intended-effects plan.** `install` already prints its plan and, on a TTY without `--yes`, waits for confirmation. State that `.agentsmith/` holds per-machine working state and must be gitignored, pointing at the README for the two forms. Cheapest; no new flags or verbs; lands where the operator is already reading and already deciding.
2. **A check on `.gitignore`.** Read the target scope's `.gitignore` and warn only when the working state is not already covered. Better signal than option 1 -- silent when there is nothing to say -- but the check is now a coverage question rather than a set-membership one: it must recognize `.agentsmith/`, `.agentsmith/*`, a bare `.agentsmith`, and a parent-level ignore as all satisfying the requirement. `git check-ignore -q .agentsmith/specs` answers that directly and correctly, rather than re-implementing the match.
3. **Write the entries.** Rejected rather than deferred: `install` modifying `.gitignore` mutates a file the user owns and did not name, which is the kind of unrequested edit the plan-then-confirm design exists to avoid.

Option 2 via `git check-ignore` is the recommendation -- it is a subprocess call and a conditional, and it cannot drift from what git actually does. Option 1 is the fallback where git is not available or the scope has no repository (`--scope user`), which is also the case where the warning matters least.

## Constraints

- Warn, never fail. A consumer may deliberately commit the store -- unwise, but their call, and `install` is not the place to enforce an instruction-set rule.
- Do not re-implement gitignore matching. Precedence, negation, and parent-directory rules are exactly what the enumeration got wrong once already; ask git.
- Say nothing when the paths are already ignored. A warning that fires on a correctly-configured project is noise on every install, and trains the operator to skip the plan output -- which is the surface this is trying to use.
- New user-facing output is public surface (`#swe-public-surface-docs`) and needs its docs in the same change.

## Provenance

Raised in the second review pass on the 2026-07-31 ephemeral-working-specs branch, as the standing risk after the finding batch was applied. Not fixed there: it is a behavior change to the install path, outside that unit's approved scope (`#ai-plan-deviation`).
