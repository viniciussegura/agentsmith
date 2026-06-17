---
description: Apply the decisions recorded in the instruction-review triage worksheet (.agentsmith/instruction-review/triage.md) -- adopt / reject / fold / defer each entry, idempotently.
argument-hint: (no arguments; reads the worksheet)
---

Apply the instruction-review triage worksheet. $ARGUMENTS

Use the `instruction-review` skill, **Apply pipeline** section. Read `.agentsmith/instruction-review/triage.md`; if it is absent or empty, report "nothing to apply" and stop.

Validate every entry first (malformed -> report and skip, never half-apply), then execute each entry by its **ticked `decision` checkbox** (none ticked = `park`), with reason/target/condition/input read from the entry's `decisionText`:

- `adopt` -> guided **ensure-end-state** edit into `instructions/` (replace the tag's section / add the rule + `ownership.yaml` row / rehome / reowner), then regenerate (`node bin/cli.js`) and run `npm test`; must stay green (#swe-done). Recovery is per-entry (snapshot, not file-wide restore).
- `reject` / `fold` / `defer` -> one line in `docs/instruction-rules-decisions.md` (one line per tag, update in place).
- `refine` -> write nothing; leave the entry and surface it with its `decisionText` for discussion.
- `park` (none ticked) -> leave it (re-surfaces next round).

Remove each terminal entry from the worksheet as it succeeds so a crash resumes cleanly; on a failed adopt, clear the tick and append the failure below the entry's `decisionText` `<!-- apply-log -->` sentinel. Report adopted / rejected / folded / deferred / refined / parked / failed at the end.
