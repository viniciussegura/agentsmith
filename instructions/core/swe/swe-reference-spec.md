# #swe-reference-spec Reference spec

The reference spec is the living description of the system as it currently is -- the single place to learn what the software does now.
It records WHAT and HOW the system is; the *why* behind cross-cutting choices lives in the design-decisions log (#swe-design-decisions), its many-to-many WHY counterpart.
It lives under the reference-spec directory (#swe-docs-layout), created lazily when the first reference document is warranted, **never** preemptively.
It is the counterpart to working specs and plans (#ai-plan): those are immutable point-in-time history, while the reference spec is mutable and always reflects the present.
When the two disagree, the reference spec wins; a working spec is **never** consulted for current truth.
A reference-spec document carries no `Status:` line: the `Draft`/`Approved`/`Implemented` lifecycle (#ai-plan) belongs to working specs and plans, whereas the reference spec has no states -- only the current truth.
The entity model (#swe-entity) is its first and canonical member.
Upkeep is not a separate mechanism: the reference spec is kept current under #swe-docs-drift and gated by #swe-done -- after a change ships, the reference spec is checked and any drift fixed in the same PR.
Where the two could be confused, use the qualified terms "working spec" and "reference spec" (#swe-terminology, #swe-naming); a bare "spec" is fine only where context makes which one unambiguous.
