# `install` never mentions the gitignore requirement it depends on

## What

`#ai-plan` states the working-spec store must be gitignored and is candid that nothing in the generator does this; the requirement is carried by that rule and the README's gitignore recipes, and by nothing the product does or says to the person running the installer.
`install` already probes one path with `git check-ignore`: it warns when `.agentsmith/docs-layout.yaml`, the file a project is meant to commit, is ignored, and that probe's form, outcome table, and output channel are shipped, tested, and documented in `docs/reference-spec/cli.md`.
Recommended: apply the same probe to the working-spec store and the rest of `.agentsmith/`, warning when they are not ignored; the remaining decision is scope (which paths, one warning or one each), not design.
Alternatives: a line in the intended-effects plan stating that `.agentsmith/` holds per-machine working state, the fallback where git is absent or the scope has no repository; writing the entries into `.gitignore`, rejected because `install` modifying a file the user owns and did not name is the unrequested edit the plan-then-confirm design exists to avoid.

## Why it matters

The failure is silent and lands in version control: `.agentsmith/specs/<branch>/` accretes one committed directory per unit of work on a project whose instruction set says it should not, and nothing surfaces it until someone notices the directory in a diff.
An un-deleted store (`2026-07-30-working-spec-store-has-no-deletion-actor.md`) is per-machine and read by nobody; an un-gitignored store is committed and shared, so this half is the worse one.

## Constraints

- Warn, never fail: a consumer may deliberately commit the store, and `install` is not the place to enforce an instruction-set rule.
- Do not re-implement gitignore matching; precedence, negation, and parent-directory rules are what the README's earlier path enumeration got wrong, so ask git.
- Say nothing when the paths are already ignored: a warning on a correctly configured project is noise on every install and trains the operator to skip the plan output.
- New user-facing output is public surface (`#swe-public-surface-docs`) and needs its docs in the same change.
