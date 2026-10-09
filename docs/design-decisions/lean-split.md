# Lean split

**Decision.** The generated set is a small always-loaded core plus on-demand bundles, each bundle loaded by its own trigger in the core's index: `process` (specs, plans, spec review, branch lifespan, epics, close-out), `frontend`, `backend`, and `authoring`.
Every module is capped (250 words in the core, 500 in a bundle, 120 for the four review-tooling rules) and the generated core is capped at 8,000 words; the caps live in one test and are cut to, never raised.
A core rule never cites a bundle-only tag bare: it names the rule in backticks with the bundle, which the lean-split gate treats as prose and a second gate resolves against every defined heading, so a session that never loads the bundle sees a name, not a dangling reference.
The one bare exception is the layout map's owner cell, a registration the parser requires bare.
A rule holds its obligations and the one-clause reason an obligation is unintelligible without; longer rationale lives here, in a decision file, or nowhere.

**Why.** An agent pays for the core on every turn, and the set had grown to 13,000 words, a quarter of them the orchestration of this repository's own review tooling and much of the rest rationale.
Rationale in a rule is read once and then re-read on every turn; a decision file is read when someone reopens the question.
The review tooling's protocol has a reference-spec document and skills as its home, so the rules point there and keep only intent, the human gates, and untrusted-data handling, which every consumer needs whether or not the tooling is installed.

**Rejected.** Keeping the process rules in the core: they govern a minority of turns and were a third of the core.
Letting core rules cite bundle tags bare: a dangling reference on every session without the bundle.
A stub rule in the core per moved rule: two headings for one tag.
Raising a cap to admit a rule: the cap exists to force the cut.

**Reopened by.** A host that loads bundles on its own, which would make the core-versus-bundle distinction moot, or evidence that an obligation moved into a document consumers cannot reach is being missed in practice.
