# #ai-review-engine Role-based review engine

- A shared, opt-in engine fans out **role-specialized reviewer sub-agents**, each a composition of existing instruction tags (#swe-reuse), not a fresh persona -- so reviewers track the instruction set instead of forking it.
- One pipeline, two applications -- **code review** (#ai-review-board) and instruction review -- sharing the registry and shape, differing only in subject, schema, persistence, and reconciliation.
- Shape: **setup -> fan-out (cheap model, parallel) -> verify (per-finding skeptic, biased to reject) -> reduce (strong-model editor; consolidates and writes the human output) -> present**.
- Three adversarial filters gate every finding into team work: verify, reduce-stage consolidation, and human acceptance.
- Degrades by host: real sub-agents, else one agent role-playing each lens, else a human filling the same schema.
