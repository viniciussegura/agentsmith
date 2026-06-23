# #ui-destructive-confirm Destructive actions need confirmation or undo

Any user-initiated irreversible or hard-to-reverse action (delete, archive, bulk-remove, reset, permanent publish) **MUST** offer one of:

1. A confirmation step that names what will be destroyed and requires an explicit positive gesture.
2. An undo affordance available long enough to notice (a snackbar/toast with Undo).

Prefer undo for low-stakes bulk actions; confirmation for single high-stakes ones.
**Never** make the destructive action the default button; label it with the action ("Delete"), not "OK"; make it visually distinct from the safe action (a different, non-primary color).
This is the user-facing mirror of #ai-tool-safety (agent actions).
