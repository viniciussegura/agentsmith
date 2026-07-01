# #ui-empty-state-guidance Empty states guide the user

Every empty state (#ui-canonical-states) **MUST** include:

1. A short reason the space is empty (first run vs. filtered result vs. no data yet).
2. A primary call-to-action out of the empty state, or -- when none is available -- what will populate the space.

**Never** render a bare "No results" without context and a way forward (#front-nielsen-heuristics, recognition over recall).

**Differentiating the three causes:**

| Cause | Copy pattern | Primary action |
|---|---|---|
| First run (nothing ever created) | "You have not created any X yet." | "Create your first X" button. |
| No data yet (waiting on an external event) | "X will appear here once Y." | Informational; no action if none is available. |
| Filtered / searched result | "No X matched your filters." | "Clear filters" or "Adjust search" link. |

Do not use the same message for all three causes.
A filtered empty state **MUST NOT** offer a "Create X" primary action -- it implies the user's search is wrong, not that data is absent.
