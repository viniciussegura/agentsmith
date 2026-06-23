# Plan: triage worksheet v2

Status: Implemented

Executes [spec.md](spec.md) (Approved). Small delta on the just-built worksheet: change how a decision is recorded (checkbox set), move it after the draft with a `decisionText` block, add the `refine` disposition. Agent-executed skill prose + a one-time worksheet re-migration; no JS, no new `#tag`, `ownership.yaml` untouched. Verify = `npm test` green, `node bin/cli.js` clean, sweep clean.

## Phase 1 -- SKILL.md (format + parse + apply)

1. **Step 5 / worksheet format** -- rewrite the worksheet-format description: bare `decision:` marker + 5-option checkbox set (none ticked = park), then bare `decisionText:`; decision after the draft; list the projected `- key:` metadata (drop `decision`/`reason`/`note` keys).
2. **Apply pipeline A1 (validate)** -- add the checkbox grammar (tick `^- \[[xX]\] <label>$` / blank; ≤1 tick; malformed variants; disposition from the ticked line only); markers are bare and only outside the fence (duplicate bare marker -> malformed); decisionText human-part = above the first `<!-- apply-log -->` sentinel (whole body if none); param extraction (fold -> first non-blank line leading `#tag`; reject/defer/refine non-empty).
3. **Apply pipeline A3/A4** -- disposition from the ticked box; add `refine` (write nothing, leave entry, gate-(ii) treats like park, report it); re-parked failure appends below the sentinel; report bucket `refined`; gate `K` excludes refine.

## Phase 2 -- Supporting docs

4. `proposal-format.md` -- update the decision-vocabulary / worksheet pointer to the checkbox + decisionText + refine model.
5. `tools/claude/commands/instruction-apply.md` + `instruction-review.md` -- touch decision wording (checkbox set; refine) where they enumerate the vocab.
6. No `instructions/` source change (charter wording is disposition-agnostic) -- confirm; regenerate only if a source changed.

## Phase 3 -- Migrate the live worksheet

7. Re-convert `.agentsmith/instruction-review/triage.md` (32 park entries): drop `- decision: park`, append the checkbox set (none ticked) + empty `decisionText:` after each draft; fix the stale "33 verified" intro to 32. (Gitignored; no decision lost.)

## Phase 4 -- Final

8. `node bin/cli.js`; `npm test` green; sweep: no `- decision:`/`- reason:`/`- note:` key references survive in `tools/` skill prose; checkbox/`decisionText`/`refine` read as intended.

## Notes
- `.claude/**` + `AGENTS.md` are gitignored build artifacts -- regenerate, don't hand-edit.
- Commit is user-gated (`#git-*`).
- The v1 worksheet spec/impl stays; this only changes the decision-recording surface.
