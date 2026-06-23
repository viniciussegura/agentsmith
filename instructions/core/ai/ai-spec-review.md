# #ai-spec-review Spec auto-review

- After writing or substantially revising a spec (#ai-plan) under `docs/working-specs/`, offer an adversarial auto-review and wait for the user's choice; never start one unprompted.
- On opt-in, a spec-specialist reviewer and the author alternate in rounds: the reviewer writes findings (each **blocking** or nit, with a stable id), the author revises the spec and writes a rebuttal (each finding `resolved` or `wontfix`), and the next reviewer reads the current spec, the latest rebuttal, and the running ledger.
- Where the tool supports sub-agents, the reviewer is a separate agent so the critique is independent; otherwise the author takes the reviewer stance each round, or a human reviews.
  Per #ai-conversational, the reviewer sub-agent dispatch **states an explicit model id** -- a model capable of sustained critical reasoning, the cheapest tier that meets that bar.
- A **review cycle** is a continuous run of rounds on one spec; round numbering and the convergence guard's state (round count and best open-blocking count) are **per cycle, not global**.
  Substantially revising a spec after a prior cycle converged, stalled, or hit the cap starts a **new cycle** with the count and best reset, even when round numbering continues for the reader.
- Convergence guard, checked after each review in this order: zero open blocking = converged; otherwise two consecutive reviews **within the cycle** that fail to beat the best (lowest) open-blocking count = stalled (earliest the cycle's third review); otherwise a **5-round-per-cycle** cap.
- On stall or cap, stop and ask the user how to proceed, summarizing open blockers and any contested `wontfix`.
- Only the final spec is committed; per-round reviews and rebuttals are ephemeral under `.agentsmith/tmp/spec-review/<spec-dir-name>/` and never committed.
