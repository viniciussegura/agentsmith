# Reviewer findings carry no `role`, so `persist.mjs` files issues under `issues/undefined/`

Date: 2026-08-11

## What it is

`persist.mjs apply` reads a top-level `role` on each finding to choose the issue's directory (`issues/<role>/`).
Nothing tells a reviewer to emit it: `SKILL.md` step 2 says only "writes its findings to `findings/<role>.json` (`new` + `reconcile` arrays, per `issue-format.md`)", and the filename is not the field.
A round whose reviewers omit it writes every issue to `issues/undefined/` and fails `lint.mjs`.

## Why it matters

It is the second instance of one shape: a hand-authored scratch file whose field names are checked only after a whole round has run.
The first was the round record's `id`, which this round also got wrong -- that half is now **fixed**: `persist.mjs` exports `assertRoundRecord`, validating the round record against `ReviewRoundInfo` before any write, and `round-args.mjs` exports `roundRecord()` so setup stops hand-writing the field names.
This entry is the remaining half, and the pattern to follow is now in the file.
Both are cheap to prevent and expensive to hit: the round completes, the driver believes it succeeded, and the defect surfaces at the final lint.

`persist.mjs` ships to consumers at `.claude/skills/code-review-board/persist.mjs`, so this is on a user path, not maintainer-only tooling.

## How it surfaced

Round `2026-08-11` on branch `instructions-terseness`.
The `project-manager` reduce noticed it while reading the findings and repaired `correctness.json`, `swe.json` and `ux.json` in place; the round then persisted clean.
Absent that catch, the store would have taken every issue in a directory named for a missing field.

## Remediation sketch

Validate findings against the `Issue` interface at the start of `persist.mjs apply` and fail naming the missing fields -- `assertRoundRecord` is the landed shape to mirror (report every missing and every unknown field together, before any write), applied per finding rather than once per round.
Cheaper complement: state the required top-level fields in `reviewer-common.md`'s output contract, where a reviewer actually reads them.

## Related, not deferred here

`review-qa` ships with `Read, Grep, Glob, Write` and no execution tool, so the lens that grades whether tests pass cannot run them; in this round it graded from a static trace of the test sources.
That is plausibly deliberate (reviewers are read-only by design) rather than an oversight, so it is recorded as an observation for whoever revisits the persona set, not as work.
