# #swe-epic Epics

An epic organizes work too large to ship as a single squash-merge (#git-branch-workflow): a multi-deliverable initiative sequenced before implementation begins.
Distinct from the review board's *epic* (#ai-review-board).

An epic is **committed and mutable**, every file edited in place as understanding changes.
It is **never** consulted for current truth -- it holds the current *plan*, not implemented fact -- and it is deleted when its last unit of work ships or it is abandoned.

Its location and naming live in the layout map (#swe-docs-layout); internally:

```text
<epic-dir>/
  README.md                    // the problem, and how to read the rest
  roadmap.md                   // version order, milestone order, cross-cutting dependencies
  decisions/<slug>.md          // provisional decisions (#swe-design-decisions)
  milestones/<id>-<slug>.md    // a milestone, its units of work as sections
  open-questions.md            // need, options, recommendation, what unblocks
```

A milestone `<id>` is epic-local, unique within the epic, with **no trailing `-<digits>`**, so it is never mistakable for a unit's display token.
A unit of work's `<slug>` is its **stable identity**, unique **epic-wide**, because dependency declarations cross milestone boundaries and resolve by slug alone.

| Concept      | Description                         | Breakdown         | GitHub map           |
| ------------ | ----------------------------------- | ----------------- | -------------------- |
| Version      | full feature release                | 1-n milestones    | Release              |
| Milestone    | themed work collection              | 1-n units of work | Milestone            |
| Unit of work | fixes issues or introduces features | none              | Issue + pull request |

Versions run sequentially; milestones and units run in parallel within their parent unless a dependency orders them, and every milestone and unit declares what must ship before it and what it blocks, so the order is explicit, never inferred from list position.

A unit of work is planned in the epic and executed as a working spec (#ai-plan) when it is picked up.
The epic entry is the unit's durable **planning** record and the PR body its durable **execution** record (#git-pr); an unplanned unit has only the latter.

Every file is written per #code-prose, and a unit entry stays at **bird's-eye altitude**: title, a one-paragraph outcome, its dependencies, and its acceptance signal -- **never** file paths, symbol names, schema shapes, or interface contracts.
Each entry carries a **delivery state**, distinct from the review board's issue lifecycle:

- `planned` -- not started.
- `in-progress` -- set when the unit is picked up and its working-spec directory is created.
- `shipped` -- set when the branch carrying the unit ships, recorded with that PR's link.

A unit's display token is `<milestone-id>-<n>`, **ordering and display only, never identity**: re-parenting renumbers it and moves no dependency edge.
If a branch carrying an `in-progress` unit is abandoned unmerged, the entry reverts to `planned`.
A provisional decision graduates to the standing log (#swe-design-decisions or #swe-reference-spec) when the first unit depending on it ships.
A technical debt (#swe-technical-debts) or deferred item (#swe-future-work) found while planning goes to its register immediately, never parked in the epic.
Open questions are removed as answered, each answer recorded in its home.
