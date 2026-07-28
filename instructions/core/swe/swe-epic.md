# #swe-epic Epics

An epic is warranted when the work spans **more than one deliverable**:

- it cannot ship as a single squash-merge, so it needs sequencing;
- it can be discussed and have a roadmap **before** implementation;
- it is **NEVER** consulted for current truth: it represents the current understanding of the work, not an implemented fact (_i.e._ every file in an epic is mutable in-place).

It should be persisted in the following format:
```
docs/epics/<slug>/
  README.md                  // entry point to understanding the epic, introducing the main problem and how to read the remaining files.
  decisions/<slug>.md        // provisional decisions.
  roadmap.md                 // delivery plan organized in versions and milestones, with a clear version sequencing, and in each version, a clear milestones planning.
  milestones/<id>-<slug>.md  // documentation of the milestone, detailing its work units and their plan.
  work-units/<id>-<slug>.md  // individual work unit documentation, comprising a title and a description (basic Jira ticket / Github issue protocol), at least.
  open-questions.md          // summary of negotiations / decisions / blockers, a brief summarizing what we need, options, recommendation, what unblocks. 
```

Related concepts:

| Concept    | Description                         | Breakdown       | Github map           | 
| ---------- | ----------------------------------- | --------------- | -------------------- | 
| Version    | full feature release                | 1-n milestones  | Release              | 
| Milestone  | themed work collection              | 1-n work units  | Milestone            |
| Work unit  | fixes issues or introduces features | none            | Issue + Pull request |

Versions are sequential in time, while milestones and work units may be executed in parallel (inside their parent scope).

A work unit that is picked up becomes a working spec (#ai-plan); its entry is reduced to a pointer; the working spec is the only copy.
A provisional decision moves to the project's decision log (_e.g._ `adr`, `reference-spec`) when the first unit depending on it ships.
A technical debt or deferred item surfaced while planning goes to its register immediately, not at graduation -- an epic is not a holding pen for findings actionable without it.
The open questions are update as they are answered: their findings are recorded in the right place and the question itself is removed.

The epic directory is deleted when its last unit ships or it's abandoned.
