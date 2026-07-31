# Review-board `persist.mjs` names the round file from an unvalidated field

Date: 2026-07-30

## The debt

`persist.mjs apply` derives the round record's filename from `record.id` without checking that it exists. Given a round record missing `id`, it writes `<store>/rounds/undefined.json` and exits 0. The store then fails `lint.mjs` -- one error (`round is missing id`) plus one warning per issue and epic in the round (`id round prefix <round> has no rounds/<round>.json`) -- so the defect is caught, but only after the whole round has run, and never by the step that caused it.

## How it surfaced, and the part that was not the tool's fault

Observed on the first real round in this repo (`2026-07-30`). The immediate cause was **operator error, not a `persist.mjs` bug**: the round record was hand-authored during setup using `roundId`, `selectedRoles`, and `priorRoundId`, while `ReviewRoundInfo` (`issue-format.md`) defines `id`, `roles`, and `previousRound`. `persist.mjs` read `record.id`, got `undefined`, and named the file from it.

The residual debt is the tool's: a `SKILL.md` step tells a human or agent to hand-write `round.json`, and nothing validates it against the interface before an entire round's output is persisted against it. A wrong field name should fail at setup, not produce a plausibly-named artifact and a lint error twenty minutes later.

Corrected in place: `rounds/2026-07-30.json` was rewritten to the real schema and `undefined.json` deleted; the store now lints clean.

## Reach

`persist.mjs` is **shipped to consumers**, not maintainer-only tooling. `planToolInstall` (`src/tools.js:13`) maps `tools/<ai>/<rest>` to `.<ai>/<rest>` for every install; only `devtools/` is authoring-only, and the sole exclusions are the two `PLUGIN_ONLY_COMMANDS`. Skills are copied unprefixed, so this file installs at `.claude/skills/code-review-board/persist.mjs` in every consumer project, behind the `/code-review-board` command the README documents.

## Cost / risk

Low, but on a user path rather than a private one.

The failure is loud in `lint.mjs` rather than silent, and no issue or epic data was affected here -- only the round record's filename and field names.

One sharp edge remains while unfixed: the filename is not round-scoped when `id` is missing, so **two malformed rounds** in the same store overwrite each other's records at `undefined.json`. Two are required -- a well-formed round writes `rounds/<id>.json` and never collides -- so this is a compounding-error case, not a first-mistake one. It matters for the `main`-target flow, where the next baseline is "the `commit` of the most recent prior `main` round" (`#ai-review-board`): a lost round record makes that baseline unresolvable.

## Why accepted for now

Not because the blast radius is private -- it is not. Because it is bounded and self-announcing: the store is per-machine and gitignored, `lint.mjs` reports it as an error, and the round's actual content survives intact under a wrong filename. A consumer who hits it loses a round record, not findings, and is told so.

Deferred rather than fixed on this branch because it is unrelated to the change that surfaced it (`#swe-technical-debts` -- record at the moment incurred, remediate as its own unit).

## Remediation sketch

Validate the round record against `ReviewRoundInfo` at the start of `persist.mjs apply` and exit non-zero naming the missing or unknown fields, rather than proceeding and deriving a filename from `undefined`. The interface is already written down; nothing reads it at runtime.

Cheaper complement: have the setup step emit `round.json` from a helper in `round-args.mjs` instead of asking the caller to hand-write it, so the field names cannot drift from the interface in the first place.
