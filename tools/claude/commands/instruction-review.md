---
description: Run a per-role audit of the instruction set; triage each proposal (reject -> decisions log / decide-later / adopt). Proposes, then adopts only what the human accepts.
argument-hint: (no arguments; full audit)
---

Run an instruction-review round over this repo's instruction set. $ARGUMENTS

Use the `instruction-review` skill. There is no diff mode -- a round is always a full audit of `instructions/` plus the generated output (`node bin/cli.js --stdout`).

Drive the round per the skill: open with the ownership coverage lint as the first finding source (orphan/double-owned `#tag`s become proposals), fan out the participating role reviewers in parallel (each emitting `InstructionProposal`s through its lens), verify each proposal adversarially (gap real and not already covered by a live `#tag`), then run the `instruction-editor` reduce to deduplicate, run the one-time global/structural rubric pass, reconcile ownership, and produce the dimension scorecard + consolidated proposal set. Finally run the **triage** step: disposition each proposal -- reject (-> `docs/instruction-rules-decisions.md`), decide-later (-> ephemeral local scratch), or adopt (-> `instructions/`, guided + `npm test`, never a blind paste).

This application **proposes, then triages** -- it edits instruction sources only via the triage step's explicit human accept (#swe-done). The single committed file it writes is the decisions log `docs/instruction-rules-decisions.md`.
