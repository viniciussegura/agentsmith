---
description: Run a per-role audit of the instruction set, rolling the proposed-instruction-rules backlog. Proposes only.
argument-hint: (no arguments; full audit)
---

Run an instruction-review round over this repo's instruction set. $ARGUMENTS

Use the `instruction-review` skill. There is no diff mode -- a round is always a full audit of `instructions/` plus the generated output (`node bin/cli.js --stdout`).

Drive the round per the skill: open with the ownership coverage lint as the first finding source (orphan/double-owned `#tag`s become proposals), fan out the participating role reviewers in parallel (each emitting `InstructionProposal`s through its lens), verify each proposal adversarially (gap real and not already covered by a live `#tag`), then run the `instruction-editor` reduce to deduplicate, run the one-time global/structural rubric pass, reconcile ownership, and roll `docs/future-work/proposed-instruction-rules.md` in place. Finally summarize what moved, what closed, and the top few to draft next.

This application **proposes only** -- it never edits instruction sources. The single committed file it writes is the rolling backlog.
