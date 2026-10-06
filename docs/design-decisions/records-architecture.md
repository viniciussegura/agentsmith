# Records architecture

**Decision.** The repo keeps two families of records: present-truth, mutable and self-replacing (the reference spec, this decisions log, and the epic, which is present-truth by mutability though it holds a provisional plan), and point-in-time, dated and removed when discharged (future-work and technical debts).
A working spec is in neither family: it is uncommitted branch scratch, mutable while its unit executes and deleted when the branch ships, so nothing in the repo is kept for it, and a unit's durable trace is its PR body.

**Why.** Provenance was scattered across many working specs; learning the current rationale meant reading several and inferring which still held.
A mutable, self-replacing WHY log, paired many-to-many with the reference spec and linked one way (present-truth links out by slug; grep a slug for referrers), gives a single current-rationale home with no staleness.
Committing working specs was the same mistake one level up: the corpus accreted while `#swe-reference-spec` forbade consulting it for current truth, so it was written and never read, and the retrieval failure was in the storage form, not the content.
Each kind of rationale is therefore routed to a form that is already self-replacing (a decision file), already at the site it constrains (a comment naming the decision's slug), or deliberately not kept (deliberation, which is point-in-time by nature; any committed form would inherit the accretion this removes, and stale deliberation misleads whoever reopens the question).

Two costs are accepted.
A record's location and its lifecycle live in two rules, the layout map and the owner rule, so learning both spans two places, a tension with `#swe-deep-modules`; accepted because path drift between rules is the more damaging failure, and one home makes a relocation a one-place edit.
The PR body is forge-hosted and offline-unavailable; accepted because the reasoning that says deliberation need not be kept says it need not be kept locally, and `git blame`, then the commit, then the PR is the access pattern for "what was considered here" at no maintenance cost.

**Rejected.** A dated, immutable decision log: it duplicates the historical role working specs played and reintroduces the staleness.
Committed, indexed working specs: written and never read, as above.
A filing tier below the reach test: there is no kept artifact to file into, by design.

**Reopened by.** Evidence that PR bodies are not consulted when a question reopens, or a host with no pull requests to carry the record.
