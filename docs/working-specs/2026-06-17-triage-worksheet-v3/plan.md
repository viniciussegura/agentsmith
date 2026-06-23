# Plan: triage worksheet v3

Status: Implemented

Executes [spec.md](spec.md) (Approved). Small delta on the v2 worksheet: locate the draft by a bare `draft:` marker (C0), add a read-only `current:` before/after block for `strengthen`, and migrate the 23 live strengthen entries. Agent-executed skill prose + a one-time worksheet migration; no JS in the generator, no new `#tag`, `ownership.yaml` untouched. Verify = `npm test` green, `node bin/cli.js` clean, sweep clean.

## Phase 1 -- SKILL.md (C0 marker + format + parse)

1. **C0 / draft as a bare marker** -- in the worksheet-format prose and A1, replace the positional "the draft is the first fenced code block" rule with: `draft:` is a **bare marker**; the draft body is the fence **immediately following the `draft:` marker**. Add `draft:` to the bare-marker family (duplicate-marker rule; recognized only outside fences).
2. **C1/C2 / worksheet format** -- in step-5 format, add the optional bare `current:` marker + fence **immediately before** `draft:` (verbatim live `## #tag` section), present for `strengthen`, omitted for `new-rule` (and text-unchanged rehome/reowner). Show the canonical order: metadata -> `current:` -> `draft:` -> `decision:` -> `decisionText:`.
3. **A1 parse contract** -- add: the normative single-pass order (match fences first, then markers/duplicates over non-fence lines); bare markers now include `current:`/`draft:`; fence-interior inertness covers **both** the current and draft fences (amend the v2 "never the draft-fence interior" to "any fence"); a marker present with no following fence -> malformed; a **missing** `current:` is never malformed and emits no note.
4. **A3 extraction depth** -- confirm/pin A3 strengthen-replace uses `## #tag ... -> next ## / EOF` (already says `##` at the current A3 line); cross-reference the §"Section extraction" `^## #<tag>(\s|$)` anchor so the `current:` snapshot and the A3 target share one delimiter. No A3/A4 **behavior** change (apply never reads `current:`).

## Phase 2 -- Generation + supporting docs

5. `tools/claude/agents/instruction-editor.md` -- add the generation note: for a `strengthen` (and a text-changing rehome/reowner), copy the verbatim `## #tag` section already read during the gap check into a `current:` block; omit for `new-rule`. No new file reads.
6. `proposal-format.md` -- update the worksheet-shape description to include the `current:` block + placement and the `draft:` marker.
7. `tools/claude/commands/instruction-apply.md` + `instruction-review.md` -- touch only if they enumerate the entry fields; apply behavior is unchanged (no `current:` awareness), so likely a one-line shape mention at most.

## Phase 3 -- Migrate the live worksheet

8. One-off script `.agentsmith/tmp/migrate-triage-v3.mjs`: for each of the 23 `strengthen` entries, read `- targetFile:`, extract the live section by `^## #<tag>(\s|$)` -> next `^## ` / EOF (verbatim, `\r?\n`-normalized to match the file), and insert a `current:` block (fence wider than any inner fence; 4 backticks suffice) immediately before that entry's `draft:` marker. New-rule entries untouched; decisions/`decisionText` preserved. If a tag is not found by the anchored match, omit `current:` and log it.
9. Verify migration: 23 `current:` markers added, 9 new-rule untouched, 0 ticks changed, every `current:` fence well-formed and its snapshot byte-matches the source section (modulo `\r?\n`).

## Phase 4 -- Final

10. `node bin/cli.js` (regenerate `.claude/**`); `npm test` green; sweep: no positional "first fenced block" wording survives in the skill prose where it would contradict C0; `current:`/`draft:` markers read as intended.

## Notes
- `.claude/**` + `AGENTS.md` are gitignored build artifacts -- regenerate, don't hand-edit.
- Commit is user-gated (`#git-*`); v3 commits separately from v2 (already committed `782bbe1`).
- The migration script is gitignored scratch; `triage.md` is gitignored (per-machine).
- C5 (rendered diff) is not built in this plan.
