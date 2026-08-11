# Records architecture

**Decision.** The repo keeps two families of records. Present-truth (mutable, self-replacing, kept current): the reference spec (`#swe-reference-spec`, WHAT/HOW now), this design-decisions log (`#swe-design-decisions`, WHY now), and an epic (`#swe-epic`) -- present-truth by mutability, though it holds a provisional plan and is deleted once its work ships. Point-in-time (dated, removed when discharged): future-work and technical-debts.

A working spec (`#ai-plan`) is in **neither** family: it is uncommitted branch scratch at `.agentsmith/specs/<branch>/<date>-<slug>/`, mutable while its unit executes, and deleted when the branch ships. It is not a record, so nothing in this repo is kept for it.

**Why.** Provenance was scattered across many working specs; learning the current rationale meant reading several and inferring which still held. A dated, immutable decision log would duplicate that historical role and reintroduce the staleness. A mutable, self-replacing WHY log -- paired many-to-many with the reference spec, linked one-way (present-truth links out by slug; grep a slug for referrers) -- gives a single current-rationale home with no staleness.

Committing working specs turned out to be the same mistake one level up. The corpus accreted while `#swe-reference-spec` forbade consulting it for current truth, so it was written and never read; the retrieval failure was in the storage form, not the content. Each kind of rationale is therefore routed to a form that is already self-replacing (a decision file), already at the site it constrains (a comment naming the decision's slug), or deliberately not kept (deliberation, which is point-in-time by nature -- any committed form would inherit the accretion this removes, and stale deliberation actively misleads whoever reopens the question).

**Consequences.** Authoring a decision is a soft `#ai-session-hygiene` prompt scoped by reach, never a `#swe-done` merge gate; `#swe-done` only keeps existing decision files current. The reach test has one tier: below it, rationale goes to a code comment or to nothing.

A unit's durable trace is its PR body (`#git-pr`), which carries the approved scope and the acceptance signal inline -- there is no committed spec to link. That places the record in the forge rather than the repo, so it is host-dependent and offline-unavailable; accepted, because the same reasoning that says deliberation need not be kept says it need not be kept locally. The PR is reached by `git blame` → commit → PR, which is the access pattern for "what was considered here" and costs nothing to maintain.

New working specs still carry a Conformance section (`#ai-plan`) reconciled against present-truth. There is no index of working specs, because there is no committed corpus to index.
