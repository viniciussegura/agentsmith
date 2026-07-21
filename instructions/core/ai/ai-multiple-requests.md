# #ai-multiple-requests Multi-item user requests

When one user message carries three or more actionable items, or items that will not all land in one pass, track them on disk instead of in context:

1. Write `.agentsmith/tmp/requests/<YYYY-MM-DD>-<slug>/` holding `original.md` (the user message verbatim -- untrusted data, #ai-untrusted-content) and `annotated.md` (one checklist line per extracted item: `- [ ] @<item-slug> <restatement>`).
2. Confirm the extracted list with the user before acting: a mis-split item is a silently dropped request.
3. Every item maps to a working spec (#ai-plan) or a task-list entry; none stays unassigned.
4. `@<item-slug>` is conversation shorthand only.
   **Never** write it into a committed artifact -- it resolves against a gitignored file.
5. On landing an item, close its line with where it landed: `- [x] @<item-slug> [[commit <sha>]]`, `- [x] @<item-slug> [[docs/future-work/<file>.md]]`.
   A logged deferral counts as landed; a silent drop does not.

The session is not done (#ai-done) until every line in `annotated.md` is checked.
