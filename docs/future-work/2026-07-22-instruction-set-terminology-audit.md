# Future work: instruction-set terminology audit

Date: 2026-07-22
Status: Deferred (`#swe-future-work`)
Context: discharged by the 2026-07-22 instruction-terminology audit (in git history), which audited the clusters this file flagged.

## The gap

An inventory of `instructions/` found seven clusters: `` `main` `` used as a rule referent instead of an example (D1); `ship` and `land` each naming two altitudes at once (D2); the hyphenated spelling of `subagent` used inconsistently in prose (D3); the actor noun `AI assistant` vs `AI agent` (D4); the orphaned term `logical units` (D5); `standard`, inventoried and found to carry no defect (D6); and `change` used as the done-gate subject (D7).
The 2026-07-22 instruction-terminology audit (in git history) covered all seven and settled six with renames landed directly in `instructions/`; D6 needed no rename.
Three residues remain, listed below.

## The deferred work

1. **The diff-sense `change` / `diff` / `commit` cluster**, scope `instructions/`. D7 settles only the gate sense.
2. **No vocabulary-regression lint**, scope `instructions/ README.md tools/ devtools/ docs/future-work/` -- the scope this spec proved is real, per D3 and success criterion 2.
3. **The `targetRef: 'main'` schema enum**, scope `docs/reference-spec/entity-model.md`, `tools/claude/skills/code-review-board/` -- per the Design B carve-out. Blocked on an entity-model change plus a **value backfill over existing `rounds/*.json`, or a dual-literal lookup in `SKILL.md` Setup's round-chaining** -- not a lint or persist change, since no script reads the field.

## Constraints

- The set is installed by other projects. A rename ships a vocabulary change to every consumer, and a project-level instruction file or session memory holding the old noun keeps it until regenerated. Prefer one audited pass over a trickle of renames.
- Frozen working specs (`#ai-plan`) are point-in-time and stay on the old vocabulary.
