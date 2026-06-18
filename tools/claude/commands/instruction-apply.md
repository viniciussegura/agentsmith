---
description: Apply the decisions recorded in the instruction-review triage worksheet (.agentsmith/instruction-review/triage.json) -- adopt / reject / fold / defer each entry, idempotently.
argument-hint: (no arguments; reads the worksheet)
---

Apply the instruction-review triage worksheet. $ARGUMENTS

Read `.agentsmith/instruction-review/triage.json`. If it is absent or has no entries, report "nothing to apply" and stop.

Otherwise, delegate entirely to the shared engine:

```
node devtools/triage-ui/apply.mjs
```

The engine (shared with the triage UI's POST /api/apply) handles everything:

- **Validate** -- `validateFile` + `validateCrossRefs` from `devtools/triage-ui/schema.mjs`; malformed entries are reported and skipped, never half-applied. `adopt` additionally requires `status.state === 'ready'`. The live instruction text is read from disk (no stored `current` in the schema).
- **Process each entry by verdict:**
  - `adopt` -- write or create the tag's rule file under its group dir in `instructions/` (whole-file, not a section splice) and ensure the `ownership.yaml` row; then regenerate (`node bin/cli.js`) and gate on `node --test` (#swe-done); per-entry snapshot recovery on failure (re-park + `applyLog` push).
  - `reject` / `fold` / `defer` -- append one canonical line to `docs/instruction-rules-decisions.md` (backtick-wrapped tag; defer hint uses `basename(targetFile)` and `role`); one line per tag, idempotent.
  - `refine` -- write nothing; leave the entry.
  - `park` (default) -- leave the entry.
  - `rehome` / `reowner` -- skipped (deferred to a future engine version).
- **Atomic splice** -- on each terminal verdict (`adopt`/`reject`/`fold`/`defer`), splice the entry from `entries[]` and rewrite `triage.json` atomically (temp + rename, canonical serializer); a crash resumes cleanly. `park` and `refine` entries remain as the carry.

Report the engine's JSON result: **adopted / rejected / folded / deferred / refined / parked / skipped / failed**. For each `refine` entry, surface its `decision.details` (the open question) and `decision.lastRoundReply` (the prior answer, if any) so discussion can happen this turn.
