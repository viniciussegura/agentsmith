# Records architecture

**Decision.** The repo keeps two families of records. Present-truth (mutable, self-replacing, kept current): the reference spec (`#swe-reference-spec`, WHAT/HOW now) and this design-decisions log (`#swe-design-decisions`, WHY now). Point-in-time (frozen/dated, the historical record): working specs and plans (`#ai-plan`), future-work, and technical-debts.

**Why.** Provenance was scattered across many frozen working specs; learning the current rationale meant reading several and inferring which still held. A dated, immutable decision log would duplicate the frozen spec's historical role and reintroduce that staleness. A mutable, self-replacing WHY log -- paired many-to-many with the reference spec, linked one-way (present-truth links out by slug; grep a slug for referrers) -- gives a single current-rationale home with no staleness.

**Consequences.** Authoring a decision is a soft `#ai-session-hygiene` prompt scoped by reach, never a `#swe-done` merge gate; `#swe-done` only keeps existing decision files current. Plans are prunable once `Implemented`; specs never are. New working specs carry a Conformance section (`#ai-plan`) reconciled against present-truth.
