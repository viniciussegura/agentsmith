# #ui-error-boundary Error boundaries isolate and surface render crashes

Wrap every independently renderable region (a page, a major widget, a third-party embed) in a framework error boundary (React `ErrorBoundary`, Vue `errorCaptured`, Angular error handler, Svelte error boundary).
**Never** let a render crash propagate to the root and blank the full viewport.

The boundary's fallback **MUST** use the `#ui-canonical-states` Error component and **MUST** surface a copy-to-clipboard error bundle (#ui-canonical-states `errorObj`) so the error is diagnosable without a console.
Do **not** re-render the boundary's children automatically -- require an explicit user gesture ("Retry") to re-mount.

**Never** swallow the error silently: log it to the observability layer (#swe-observability) from the boundary's catch handler.
