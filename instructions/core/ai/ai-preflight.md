# #ai-preflight Plan execution preflight

Before executing an approved plan, ask and wait for answers to two questions:

1. **Execution shape** -- sequential in the main thread, delegated to parallel subagents, or delegated to sequential subagents? 
   Give a rough per-option token estimate as an order-of-magnitude integer (e.g. ~2k, ~10k, ~50k).
2. **Interaction shape** -- pause for checks and questions as they arise, or run non-stop and batch every question and decision at the end?

For every preflight question, **always signal a recommended answer** and mark it clearly (e.g. "(Recommended)") so the user can accept the default at a glance.
Answers are scoped to the current plan and not persisted; re-ask at the start of each plan -- do not infer from prior conversations, memory, or runtime hints.
**Non-stop mode does not waive confirmation for destructive or irreversible actions**: the tool-safety floor (#ai-tool-safety) is independent of interaction shape; batching questions never defers a confirmation that guards an irreversible step.
