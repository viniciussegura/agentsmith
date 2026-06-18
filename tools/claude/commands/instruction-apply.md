---
description: Apply the decisions recorded in the instruction-review triage worksheet (.agentsmith/instruction-review/triage.json) -- adopt / reject / fold / defer each entry, idempotently.
argument-hint: (no arguments; reads the worksheet)
---

Apply the instruction-review triage worksheet. $ARGUMENTS

Read `.agentsmith/instruction-review/triage.json`. If it is absent or has no entries **and** no candidates, report "nothing to apply" and stop.

Otherwise, delegate entirely to the shared engine:

```
node devtools/triage-ui/apply.mjs
```

The engine (shared with the triage UI's POST /api/apply) handles entries and candidates:

- **Validate** -- `validateFile` + `validateCrossRefs` from `devtools/triage-ui/schema.mjs`; malformed entries are reported and skipped, never half-applied. `adopt` additionally requires `status.state === 'ready'`. The live instruction text is read from disk (no stored `current` in the schema).
- **Process each entry by verdict:**
  - `adopt` -- write or create the tag's rule file under its group dir in `instructions/` (whole-file, not a section splice) and ensure the `ownership.yaml` row; then regenerate (`node bin/cli.js`) and gate on `node --test` (#swe-done); per-entry snapshot recovery on failure (re-park + `applyLog` push).
  - `reject` / `fold` / `defer` -- append one canonical line to `docs/instruction-rules-decisions.md` (backtick-wrapped tag; defer hint uses `basename(targetFile)` and `role`); one line per tag, idempotent.
  - `refine` -- write nothing; leave the entry.
  - `park` (default) -- leave the entry.
  - `rehome` / `reowner` -- skipped (deferred to a future engine version).
- **Atomic splice** -- on each terminal verdict (`adopt`/`reject`/`fold`/`defer`), splice the entry from `entries[]` and rewrite `triage.json` atomically (temp + rename, canonical serializer); a crash resumes cleanly. `park` and `refine` entries remain as the carry.
- **Candidate pass** -- after the entries loop the engine processes `candidates[]`: `reject` splices the candidate and appends one canonical decisions-log line (details default to "not pursued"); `wanted` is surfaced in the report but left in place for the agent promotion step (below); `park` is left unchanged.

After the engine exits, for each tag in the `wanted` list, perform the **single-atomic-write promotion** (this is the explicit exception where the agent writes `triage.json` directly):
1. Read `.agentsmith/instruction-review/triage.json` and migrate it with `migrateWorksheet` (so the base is the canonical v3 form, including any reject-candidate splices the engine just made).
2. Author a house-style (`#code-markdown`) draft for the candidate.
3. Build the promoted entry in memory: `kind`/`role`/`targetFile`/`gap` inherited from the candidate; `draft` filled non-empty; `status: {state:'ready'}`; `decision: {verdict:'park'}`; `applyLog: []`.
4. Construct the next file object with the entry **added** and the candidate **removed** in one object literal.
5. Validate locally with `validateFile` (must be problem-free).
6. Write it in **one** atomic write (one candidate at a time, sequentially).
If validation fails or the write 400s, neither mutation persists (the candidate stays `wanted`).
Promotion never adopts -- the gate is the later human-driven `adopt`, which keeps the existing per-entry snapshot recovery.

Report the engine's JSON result: **adopted / rejected / folded / deferred / refined / parked / skipped / failed / wanted / ignored**. For each `refine` entry, surface its `decision.details` (the open question) and `decision.lastRoundReply` (the prior answer, if any) so discussion can happen this turn.
For each `wanted` candidate, confirm whether its promotion to a parked entry succeeded.
