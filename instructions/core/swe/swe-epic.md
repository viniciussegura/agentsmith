# #swe-epic Epics

An epic organizes work too large to ship as a single squash-merge (#git-branch-workflow) -- a multi-deliverable initiative that needs sequencing and a roadmap before implementation begins.
It is warranted when the work spans **more than one deliverable**: it cannot land in one squash-merge, so it must be broken down and sequenced.
Distinct from the review board's *epic* (#ai-review-board), which clusters related issues in a triage report: a forward planning artifact here, an issue grouping there.

Like the reference spec (#swe-reference-spec), an epic is **committed, mutable, and self-replacing**: every file is edited in place as understanding changes. A working spec (#ai-plan) differs on the first count -- it is uncommitted branch scratch, deleted when the branch ships -- which is why an epic entry, not the working spec, is a unit's durable record.
It is **never** consulted for current truth -- it holds the current *plan*, not implemented fact.
It is topic-scoped, not point-in-time, so its directory carries no date prefix.
It is deleted when its last unit of work ships or it is abandoned.

Its location and naming live in the layout map (#swe-docs-layout); internally:
```
<epic-dir>/
  README.md                    // entry point: the problem, and how to read the rest.
  roadmap.md                   // sequencing plan: version order, per-version milestone order, and cross-cutting dependencies.
  decisions/<slug>.md          // provisional decisions (#swe-design-decisions), not yet standing.
  milestones/<id>-<slug>.md    // a milestone, and its units of work as sections.
  open-questions.md            // open negotiations/blockers: need, options, recommendation, what unblocks.
```

A milestone `<id>` is epic-local and author-chosen; it need only be unique within the epic, and carries one format constraint -- **no trailing `-<digits>`** -- so that a unit's display token splits unambiguously (a milestone `release-1` must not yield a unit token indistinguishable from a milestone `release-1-2`).
A unit of work's `<slug>` is its **stable identity** and is unique **epic-wide**: dependency declarations cross milestone boundaries and resolve by slug alone, so a slug shared across two milestones would make an edge ambiguous.
The two namespaces need not be jointly disjoint, because dependency declarations are same-tier reference lists keyed on their own entity's identifier (milestone to milestone, unit to unit).

Structure:

| Concept      | Description                         | Breakdown         | GitHub map           |
| ------------ | ----------------------------------- | ----------------- | -------------------- |
| Version      | full feature release                | 1-n milestones    | Release              |
| Milestone    | themed work collection              | 1-n units of work | Milestone            |
| Unit of work | fixes issues or introduces features | none              | Issue + pull request |

The roadmap defines the **sequencing plan**: versions run sequentially in time, while milestones and units of work run in parallel within their parent scope unless a dependency orders them.
Every milestone and unit of work declares its dependencies -- what must ship before it can start, and what it blocks -- so the executable order is explicit, not inferred from list position.

A unit of work is planned in the epic and executed as a working spec (#ai-plan) when it is picked up.
The **epic entry remains the unit's durable record**; the working spec derived from it is branch scratch and never the copy of record, so the roadmap never has holes where its in-flight units should be.

A unit entry is capped at **bird's-eye altitude**: title, a one-paragraph outcome, its dependencies, and its acceptance signal.
Explicitly **not** file paths, symbol names, schema shapes, or interface contracts -- those are decided when the unit is picked up, and detail written before implementation decays.
Each entry carries a **delivery state**, deliberately distinct vocabulary from the review board's issue lifecycle (#ai-review-board):

- `planned` -- not started.
- `in-progress` -- set when the unit is picked up and its working-spec directory is created.
- `shipped` -- set on the ship of the branch on which the unit landed, recorded with that PR's link. When a branch carries several landed units, all reach `shipped` on that one ship.

A unit's display token is `<milestone-id>-<n>`, which locates its milestone without a lookup.
It is **ordering and display only, never identity**: re-parenting a unit renumbers the token and moves no dependency edge, because every edge is keyed on the epic-wide `<slug>` above.
If a branch carrying an `in-progress` unit is abandoned without merging, the entry reverts to `planned` -- an epic holds the current plan, so unlike a discardable scratch directory a stale roadmap is read.
A provisional decision graduates to the project's standing decision log (#swe-design-decisions or #swe-reference-spec) when the first unit depending on it ships.
A technical debt (#swe-technical-debts) or deferred item (#swe-future-work) surfaced while planning goes to its register immediately, not at graduation -- an epic is not a holding pen for findings actionable without it.
Open questions are updated as they are answered: each answer is recorded in its proper home and the question is removed.
