# Review-board `persist.mjs` writes the round record to `undefined.json`

Date: 2026-07-30

## The debt

`node tools/claude/skills/code-review-board/persist.mjs apply <store> <roundId>` writes the round record to `<store>/rounds/undefined.json` instead of `<store>/rounds/<roundId>.json`. The file's **contents are correct** -- the round id is present inside the JSON -- so only the filename is wrong: the `roundId` reaching the path expression is `undefined` on that code path, while the copy written into the body is not.

Observed on the first real round in this repo (`2026-07-30`), driven by `board-round.mjs` through the Workflow driver. The issue and epic files under `issues/` and `epics/` were named correctly in the same run, so the defect is specific to the round-record write.

## Why accepted for now

It is in maintainer-only tooling, not in anything shipped to consumers or on any user path, and it does not lose data: the round record exists and is readable, and every id inside it is right.

Fixing it properly means reading `persist.mjs`'s `apply` path and deciding whether the round id should come from the argv, from `round.json` in the scratch, or from the already-parsed record -- a small change, but one that wants a test alongside it, since nothing currently asserts the round-record filename.

## Cost / risk

Low, with one sharp edge: the filename is not round-scoped, so a **second round in the same store overwrites the first round's record**. Round-to-round history in `rounds/` is therefore lost until this is fixed, which matters for the `main`-target flow where the next baseline is "the `commit` of the most recent prior `main` round" (`#ai-review-board`). Issue and epic files are unaffected.

## Remediation sketch

Pass the round id explicitly into the path expression in `persist.mjs`'s `apply` branch, and add an assertion that `rounds/<roundId>.json` exists after a round -- the absence of any test over the round-record filename is why this shipped unnoticed.

Delete `<store>/rounds/undefined.json` when fixing; it is per-machine gitignored state, so no migration is needed.
