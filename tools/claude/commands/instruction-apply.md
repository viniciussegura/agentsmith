---
description: Apply the decisions recorded in the instruction-review triage worksheet (.agentsmith/instruction-review/triage.md) -- adopt / reject / fold / defer each entry, idempotently.
argument-hint: (no arguments; reads the worksheet)
---

Apply the instruction-review triage worksheet. $ARGUMENTS

Use the `instruction-review` skill, **Apply pipeline** section. Read `.agentsmith/instruction-review/triage.md`; if it is absent or empty, report "nothing to apply" and stop.

Validate every entry first (malformed -> report and skip, never half-apply), then execute each entry by its `decision`:

- `adopt` -> guided **ensure-end-state** edit into `instructions/` (replace the tag's section / add the rule + `ownership.yaml` row / rehome / reowner), then regenerate (`node bin/cli.js`) and run `npm test`; must stay green (#swe-done). Recovery is per-entry (snapshot, not file-wide restore).
- `reject` / `fold:<tag>` / `defer:<condition>` -> one line in `docs/instruction-rules-decisions.md` (one line per tag, update in place).
- `park` -> leave it (re-surfaces next round).

Remove each entry from the worksheet as it succeeds so a crash resumes cleanly; re-park a failed adopt with a `- note:`. Report adopted / rejected / folded / deferred / parked / failed at the end.
