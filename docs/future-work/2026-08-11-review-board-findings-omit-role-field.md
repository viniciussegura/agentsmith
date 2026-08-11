# Reviewer findings carry no `role`, so `persist.mjs` files issues under `issues/undefined/`

Date: 2026-08-11

## What it is

`persist.mjs apply` reads a top-level `role` on each finding to choose the issue's directory (`issues/<role>/`).
Nothing tells a reviewer to emit it: `SKILL.md` step 2 says only "writes its findings to `findings/<role>.json` (`new` + `reconcile` arrays, per `issue-format.md`)", and the filename is not the field.
A round whose reviewers omit it writes every issue to `issues/undefined/` and fails `lint.mjs`.

## Why it matters

It is the second instance of one shape: a hand-authored scratch file whose field names are checked only after a whole round has run.
The first is `docs/technical-debts/2026-07-30-persist-round-file-undefined.md` -- the round record's `id`, which this round also got wrong, exactly as that note predicted.
Both are cheap to prevent and expensive to hit: the round completes, the driver believes it succeeded, and the defect surfaces at the final lint.

`persist.mjs` ships to consumers at `.claude/skills/code-review-board/persist.mjs`, so this is on a user path, not maintainer-only tooling.

## How it surfaced

Round `2026-08-11` on branch `instructions-terseness`.
The `project-manager` reduce noticed it while reading the findings and repaired `correctness.json`, `swe.json` and `ux.json` in place; the round then persisted clean.
Absent that catch, the store would have taken every issue in a directory named for a missing field.

## Remediation sketch

Validate findings against the `Issue` interface at the start of `persist.mjs apply` and exit non-zero naming the missing fields, the same fix `2026-07-30-persist-round-file-undefined.md` sketches for the round record -- one validation step covering both, rather than two.
Cheaper complement: state the required top-level fields in `reviewer-common.md`'s output contract, where a reviewer actually reads them.

## Related, not deferred here

`review-qa` ships with `Read, Grep, Glob, Write` and no execution tool, so the lens that grades whether tests pass cannot run them; in this round it graded from a static trace of the test sources.
That is plausibly deliberate (reviewers are read-only by design) rather than an oversight, so it is recorded as an observation for whoever revisits the persona set, not as work.
