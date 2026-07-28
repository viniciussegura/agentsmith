# #swe-epic Epics

An epic organizes work too large to ship as a single squash-merge (#git-branch-workflow) -- a multi-deliverable initiative that needs sequencing and a roadmap before implementation begins.
It is warranted when the work spans **more than one deliverable**: it cannot land in one squash-merge, so it must be broken down and sequenced.
Distinct from the review board's *epic* (#ai-review-board), which clusters related issues in a triage report: a forward planning artifact here, an issue grouping there.

Like the reference spec (#swe-reference-spec) and unlike a working spec (#ai-plan), an epic is **mutable and self-replacing**: every file is edited in place as understanding changes.
It is **never** consulted for current truth -- it holds the current *plan*, not implemented fact.
It is topic-scoped, not point-in-time, so its directory carries no date prefix.
It is deleted when its last unit of work ships or it is abandoned.

Its location and naming live in the layout map (#swe-docs-layout); internally:
```
<epic-dir>/
  README.md                    // entry point: the problem, and how to read the rest.
  roadmap.md                   // sequencing plan: version order, per-version milestone order, and cross-cutting dependencies.
  decisions/<slug>.md          // provisional decisions (#swe-design-decisions), not yet standing.
  milestones/<id>-<slug>.md    // a milestone: its units of work and their plan.
  units-of-work/<id>-<slug>.md // one unit of work: title + description, at least (issue-ticket protocol).
  open-questions.md            // open negotiations/blockers: need, options, recommendation, what unblocks.
```

`<id>` is epic-local and author-chosen; it need only be unique within the epic.

Structure:

| Concept      | Description                         | Breakdown         | GitHub map           |
| ------------ | ----------------------------------- | ----------------- | -------------------- |
| Version      | full feature release                | 1-n milestones    | Release              |
| Milestone    | themed work collection              | 1-n units of work | Milestone            |
| Unit of work | fixes issues or introduces features | none              | Issue + pull request |

The roadmap defines the **sequencing plan**: versions run sequentially in time, while milestones and units of work run in parallel within their parent scope unless a dependency orders them.
Every milestone and unit of work declares its dependencies -- what must ship before it can start, and what it blocks -- so the executable order is explicit, not inferred from list position.

A unit of work is planned in the epic and executed as a working spec (#ai-plan): when it is picked up it **becomes** a working spec, and its epic entry is reduced to a pointer -- the path to that working-spec directory -- which is then the only copy.
A provisional decision graduates to the project's standing decision log (#swe-design-decisions or #swe-reference-spec) when the first unit depending on it ships.
A technical debt (#swe-technical-debts) or deferred item (#swe-future-work) surfaced while planning goes to its register immediately, not at graduation -- an epic is not a holding pen for findings actionable without it.
Open questions are updated as they are answered: each answer is recorded in its proper home and the question is removed.
