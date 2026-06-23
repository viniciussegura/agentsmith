# #ui-perceived-performance Perceived performance

Acknowledge every user action within ~100ms, even when the result is not ready: busy or disable the trigger so it cannot be double-submitted, and show that work started.
For an operation that may exceed ~1s, show determinate progress when the total is known, otherwise an indeterminate busy state; never leave the UI visually idle while work runs.
Prefer an optimistic update with rollback-on-error for actions that almost always succeed; otherwise keep the trigger busied until the result lands.
Clear the busy state and re-enable the trigger on both success and failure.
