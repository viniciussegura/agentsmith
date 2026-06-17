---
description: Run a per-role audit of the instruction set; write an editable triage worksheet that /instruction-apply later applies. Proposes, then adopts only what the human accepts.
argument-hint: (no arguments; full audit)
---

Run an instruction-review round over this repo's instruction set. $ARGUMENTS

Use the `instruction-review` skill. There is no diff mode -- a round is always a full audit of `instructions/` plus the generated output (`node bin/cli.js --stdout`).

Drive the round per the skill: open with the parked-check gate and the ownership coverage lint as the first finding source (orphan/double-owned `#tag`s become proposals), fan out the participating role reviewers in parallel (each emitting `InstructionProposal`s through its lens), verify each proposal adversarially (gap real and not already covered by a live `#tag`), then run the `instruction-editor` reduce to deduplicate, run the one-time global/structural rubric pass, reconcile ownership, and produce the dimension scorecard + consolidated proposal set. Finally present the scorecard + nits, write the **triage worksheet** `.agentsmith/instruction-review/triage.md` (each proposal with an unticked `decision` checkbox = `park`), and **stop** -- the human ticks a decision per entry in the worksheet and runs `/instruction-apply` to apply them (adopt / reject / fold / defer / refine).

This application **proposes, then triages via the worksheet** -- a round never edits `instructions/` or the decisions log in-session; it writes only the gitignored worksheet. `/instruction-apply` writes the decisions log `docs/instruction-rules-decisions.md` and adopts into `instructions/`, gated on the human's recorded decisions (#swe-done).
