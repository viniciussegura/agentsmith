# #ai-review-engine Role-based review engine

- A shared, opt-in engine fans out **role-specialized reviewer sub-agents**, each a composition of existing instruction tags (#swe-reuse), not a fresh persona -- so reviewers track the instruction set instead of forking it.
- One pipeline, three applications -- **code review** (#ai-review-board), **instruction review**, and **spec review** (#ai-spec-review) -- sharing the registry and shape, differing only in subject, schema, persistence, and reconciliation.
  Spec review differs in two further traits: its reduce runs **in-loop** (a generalist converges the fan-out every round, rather than a once-per-round PM), and it selects lenses by the generalist's **semantic routing** over the curated `spec_review` registry column, not by path-glob gating (a spec has no diff).
- Shape: **setup -> fan-out (parallel) -> verify (per-finding skeptic, biased to reject) -> reduce (editor; consolidates and writes the human output) -> present**.
  Per #ai-conversational, every sub-agent dispatch states an explicit model id: fan-out and verify use the cheapest model whose context window and tool-use capability suffice; reduce uses a stronger model capable of sustained multi-step reconciliation.
- **Setup mints a round-id first** (date-based `<YYYY-MM-DD>`, suffixed `[a]`, `[b]`, ... for same-day reruns) so the scratch and archive paths are defined before fan-out.
- **Setup includes a parked-check gate** when a prior worksheet has entries: surface the total and the un-applied terminal-decision count, then offer ignore-parked (archive, start fresh) / consider-parked (merge additively, deduped) / stop-and-process (hand off to apply without re-auditing).
- Three adversarial filters gate every finding into team work: verify, reduce-stage consolidation, and human acceptance.
- Degrades by host: real sub-agents, else one agent role-playing each lens, else a human filling the same schema.
