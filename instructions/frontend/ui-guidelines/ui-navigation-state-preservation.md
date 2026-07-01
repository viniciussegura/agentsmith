# #ui-navigation-state-preservation Navigation preserves the user's place

**Scroll position.** When the user navigates from a list or feed into a detail view and then returns, the list **MUST** restore its previous scroll position.
Do not reset to the top on back-navigation.

**Form state.** A partially-filled form **MUST NOT** be silently cleared when the user navigates away within the same session and returns via the back gesture or breadcrumb.
Either persist the draft (sessionStorage or equivalent) or warn before navigating away (#ui-destructive-confirm).

**Why.** Losing the user's place forces them to reconstruct context they already established, violating user control and recognition over recall (#front-nielsen-heuristics).
On SPA routing the browser's scroll restoration is often suppressed; restoring it is an explicit implementation step, not a default.
