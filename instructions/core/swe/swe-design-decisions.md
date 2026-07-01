# #swe-design-decisions Design decisions

The design-decisions log records *why* the system is as it is now -- the standing rationale for choices that bind work beyond the unit that introduced them.
It lives under the design-decisions directory, one file per decision (#swe-docs-layout), created lazily when the first cross-cutting decision is warranted, **never** preemptively.
Like the reference spec (#swe-reference-spec) and unlike working specs (#ai-plan), a decision file is **mutable and self-replacing**: no `Status:` line, no date in the name. Edit it in place when the decision changes; delete it when the decision is abandoned. Past rationale is preserved by the frozen working spec that introduced the change (#ai-plan) and by git -- the log never accretes superseded entries.
Scope by reach: a choice local to one unit stays in that unit's working spec; only a choice that binds other work, or that a future contributor would re-litigate, earns a decision file. A decision is always project scope (a committed repo file).
It is the WHY counterpart to the reference spec's WHAT/HOW; the relationship is many-to-many. Present-truth documents and working specs link **out** to a decision by slug; a decision need not enumerate its referrers -- to find what a decision affects, grep its slug.
Distinct from `docs/instruction-rules-decisions.md`, the regenerated audit output of the instruction-review application (`#ai-instruction-review`), which is not hand-authored rationale.
Kept current under #swe-docs-drift and gated by #swe-done, which checks that an existing decision file is not left stale when a change alters its rationale -- never that a new decision must be authored (authoring is a soft #ai-session-hygiene prompt).
