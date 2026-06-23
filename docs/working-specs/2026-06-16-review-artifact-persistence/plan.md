# Plan: review-artifact persistence

Status: Implemented

Executes [spec.md](spec.md). Mostly prose edits across instruction + skill files, one small `lint.mjs` change, and a backlog migration. No new modules. Every phase ends green on `npm test` + a clean `node bin/cli.js` (no warnings).

## Phase 1 — Board → local (Change A)

1. `instructions/core/ai.md` — replace the `#ai-review-board` persistence bullet with the spec's pinned `#ai-review-board` replacement prose (local board, nothing committed, tracker sink, baseline gate).
2. `tools/claude/skills/review-board/issue-format.md`:
   - §The store — store path → `.agentsmith/review-board/`; move the `config.yaml` line (+ `instruction-review.participants` annotation) into that tree; strike "`No agent deletes store files -- git history is the archive.`" → local-lifetime guarantee; add the atomic-wipe / `relatedIssues`-lint-stays-error note (A6/C11).
   - §Compositional id — strike "`Ids are never reused, so relatedIssues links stay valid forever.`" → "valid within the local store's lifetime; cross-machine continuity is the tracker's job".
   - §Validation — strike the CI/pre-commit-gate framing; relax `promotedTo`-required to "only when a tracker is configured" (N1).
3. `tools/claude/skills/review-board/SKILL.md` — board path (store + `config.yaml` under `.agentsmith/review-board/`, nothing under `reviews/`); baseline gate in setup (i-feature / i-main recurring / i-bootstrap / ii / iii + absent-store routing); step-4 lint `… lint.mjs reviews` → `… lint.mjs .agentsmith/review-board`; all `reviews/config.yaml` refs (incl. §Participants prose + default-config block) → `.agentsmith/review-board/config.yaml`.
4. `tools/claude/skills/review-board/lint.mjs` — the no-tracker `promotedTo` relaxation: read tracker presence from `.agentsmith/review-board/config.yaml`; require `promotedTo` on a `promoted` issue **only** when a tracker is configured. (Path arg already supported.)

**Verify P1:** `npm test` green; `node .claude/skills/review-board/lint.mjs .agentsmith/review-board` runs (clean on an empty/sample store); `node bin/cli.js` no warnings.

## Phase 2 — Instruction-review → decisions-only + triage (Change B + D)

5. `instructions/authoring/instruction-review.md` — `#ai-instruction-review`: relax "proposes only" → "proposes, then triages; adopts only what the human accepts (#swe-done)"; output = ephemeral queue/drafts + single committed decisions log `docs/instruction-rules-decisions.md`; update hardcoded path.
6. `tools/claude/skills/instruction-review/SKILL.md` — strike "proposes only" (front-matter + body); replace §5 Present with the Change D triage step (D1–D4: four dispositions, guided adoption branched by kind w/ revert + pre-edit stash guard, parked.md read/de-dup/in-session-clear, optional + batched via `AskUserQuestion`); persistence wording → decisions-only; `instruction-review.participants` → `.agentsmith/review-board/config.yaml`; path → new decisions log.
7. `tools/claude/skills/instruction-review/proposal-format.md` — strike "proposes only" opening; retitle §Backlog maintenance → "Decisions log" with the decisions-only structure (one line per rejected/folded/deferred; deferred carries `(→ targetFile, role)`; ≤1 entry per tag, checked before append per C17); replace old backlog path with the decisions log.

**Verify P2:** `npm test` green; `node bin/cli.js --stdout` shows the relaxed `#ai-instruction-review` text and no dangling `#tag`; no warnings.

## Phase 3 — Migration (Change B3) — depends on P2

8. Create `docs/instruction-rules-decisions.md`: from `docs/future-work/proposed-instruction-rules.md`, extract **decisions only** — rejected/folded as one-liners; conditional B/C/D bands collapsed to `#tag — deferred: <condition> (→ <targetFile>, <role>)` (drafts dropped, recoverable from git history). Ready-portable open proposals are not carried (the audit re-finds them).
9. Remove `docs/future-work/proposed-instruction-rules.md`.

**Verify P3:** old file gone; new file present and well-formed; `grep -rn "proposed-instruction-rules.md\|reviews/config.yaml\|proposes only" instructions tools` returns nothing in sources.

## Phase 4 — Final verification

10. `node bin/cli.js` (regen `AGENTS.md` + `.claude/**`), no warnings.
11. `npm test` — full suite green (currently 87).
12. Sweep: no stale `reviews/` store refs, no `proposed-instruction-rules.md` refs, no surviving "proposes only" in sources; `#ai-review-board` / `#ai-instruction-review` read as intended in the generated output.

## Notes / risks

- `.gitignore`, `ownership.yaml`, `roles.yaml` — **no change** (spec).
- No `reviews/` directory is created (it was never populated); ensure nothing re-introduces it.
- `lint.mjs` change is the only executable code; keep it read-only (reports, never mutates) as today.
- Commit is a separate user-gated step (`#git-*`); plan stops at green + clean working tree review.
