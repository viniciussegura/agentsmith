# Plan: instruction-review triage worksheet + apply command

Status: Implemented

Executes [spec.md](spec.md) (Approved). The apply logic is **agent-executed skill prose** (like the existing instruction-review SKILL.md), not a JS module -- so there are no new unit tests; verification is `npm test` staying green (generation + ownership lint, unaffected by skill prose), `node bin/cli.js` clean, the new command installing to `.claude/`, and a real `/instruction-apply` run against the existing `triage.md`. No instruction `#tag`s are added by this change, so `ownership.yaml` is untouched.

Sequenced **apply-first**: Phase 1 makes `/instruction-apply` runnable so the worksheet can be tested immediately; later phases rewrite the round flow that *produces* the worksheet.

## Phase 1 -- Apply path (testable end-to-end)

1. `tools/claude/commands/instruction-apply.md` (NEW) -- thin command: parse no args; "use the instruction-review skill, Apply pipeline"; one-line purpose.
2. `tools/claude/skills/instruction-review/SKILL.md` -- add an **## Apply pipeline** section implementing spec §3: read+validate `triage.md` (§3.2 structural + per-decision rules, `\r?\n` normalize, malformed->report+skip), clean-base pre-flight (§3.3), process by decision with the declarative idempotent ensure-end-state per kind (§3.5), per-entry snapshot recovery on `npm test` failure (§3.4), per-entry removal + summary report (§3.6). State the worksheet path and decision vocab.
3. Regenerate `node bin/cli.js`; confirm `.claude/commands/instruction-apply.md` and the updated skill are installed; `npm test` green.

**Verify P1:** `/instruction-apply` is invocable; a dry read of `triage.md` parses all 32 entries; editing one entry to `adopt` and running it lands the rule + leaves `npm test` green (the real test the user runs).

## Phase 2 -- Round-flow rewrite (produces the worksheet)

4. `SKILL.md` step 1 (Setup) -- add the **parked-check gate** (spec §2.1): mint `<round-id>` first; if `triage.md` non-empty, present the 3-option gate with `N`/`K` counts (ignore->archive to `.agentsmith/tmp/instruction-review/<round-id>/triage-prev.md` / consider->additive merge via the §3.5 check / stop->abort + handoff); absent/empty -> proceed.
5. `SKILL.md` step 5 -- replace the in-session disposition loop with **reduce-output + handoff** (spec §2.2): present scorecard + nits, write/refresh `triage.md` (all `decision: park`, schema projection §1.3), stop with a handoff naming the file + `/instruction-apply`. Scope the scorecard invariant to "when reduce runs".
6. `SKILL.md` Scratch/persistence wording -> worksheet path `.agentsmith/instruction-review/triage.md`; note it replaces `parked.md`.

**Verify P2:** `node bin/cli.js --stdout` clean; a dry run of `/instruction-review` would write the worksheet and stop (no AskUserQuestion disposition loop); gate wording matches spec.

## Phase 3 -- Supporting docs

7. `tools/claude/skills/instruction-review/proposal-format.md` -- decision vocabulary (`park|adopt|reject|fold|defer`), the worksheet format pointer, and **keep** the `deferred` decisions-log line type (now reached via `defer:<condition>`); reconcile the "Decisions log" section with the worksheet handoff.
8. `instructions/authoring/instruction-review.md` -- `#ai-instruction-review` charter: "proposes, then triages via an editable worksheet applied by `/instruction-apply`" (a source-instruction edit -> regenerate).
9. `tools/claude/commands/instruction-review.md` -- update any triage/AskUserQuestion wording to the worksheet+handoff model.

**Verify P3:** `node bin/cli.js`; `npm test` green; generated `#ai-instruction-review` reads as intended.

## Phase 4 -- Migration + final sweep

10. Migration (parked.md -> triage.md): **already done this session** -- confirm `triage.md` present (32 entries), `parked.md` gone.
11. `node bin/cli.js`, `npm test` -- full green.
12. Sweep: no stale `parked.md` references survive in `tools/` or `instructions/` sources; `triage.md` / `/instruction-apply` read as intended in generated output.

## Notes / risks

- No `ownership.yaml`/`roles.yaml` change; no new `#tag` (adopting `git-tooling` etc. is a *triage* action, separate from this change).
- `.claude/**` and generated `AGENTS.md` are gitignored build artifacts -- regenerate, don't hand-edit.
- Commit is a separate user-gated step (`#git-*`); the plan stops at green + clean review.
- Spec addenda surfaced during conversion (4-backtick draft fences; `be-api-first` table `|`): fold the 4-backtick clarification into the SKILL Apply-pipeline parse description in Phase 1 (it is how the real worksheet is already written).
