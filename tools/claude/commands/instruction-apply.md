---
description: Apply the decisions recorded in the instruction-review triage worksheet (.agentsmith/instruction-review/triage.json) -- adopt / reject / fold / defer each entry, idempotently.
argument-hint: (no arguments; reads the worksheet)
---

Apply the instruction-review triage worksheet. $ARGUMENTS

Use the `instruction-review` skill, **Apply pipeline** section. Read `.agentsmith/instruction-review/triage.json`; if it is absent or has no entries, report "nothing to apply" and stop.

Validate every entry first with `devtools/triage-ui/schema.mjs` (`validateFile` + `validateCrossRefs`; malformed -> report and skip, never half-apply), then execute each entry by its **`decision.verdict`** (default `park`), with reason/condition/input from `decision.details` and the fold target from `decision.foldTarget`:

- `adopt` -> requires `status.state === 'ready'`; guided **ensure-end-state** edit into `instructions/` (replace the tag's section / add the rule + `ownership.yaml` row / rehome / reowner), then regenerate (`node bin/cli.js`) and run `npm test`; must stay green (#swe-done). Recovery is per-entry (snapshot, not file-wide restore).
- `reject` / `fold` / `defer` -> one line in `docs/instruction-rules-decisions.md` in the canonical grammar (backtick-wrapped tag; defer hint uses `basename(targetFile)`), one line per tag, update in place.
- `refine` -> write nothing; leave the entry and surface it with its `decision.details` for discussion.
- `park` (default) -> leave it (re-surfaces next round).

On each success, **splice the terminal entry and rewrite `triage.json` atomically** (canonical serializer) so a crash resumes cleanly; on a failed adopt, set the entry's `decision` to `{verdict:'park'}` and push the failure to `entry.applyLog`. `current` is never read (review-surface only). Report adopted / rejected / folded / deferred / refined / parked / failed at the end.
