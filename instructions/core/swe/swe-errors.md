# #swe-errors Error handling and logging

**Never** silently swallow an error: handle it, or propagate it with context added.
Context **MUST** name the operation and its distinguishing inputs (_e.g._ `wrap(err, 'fetchUser', { userId })`) so structured logs are greppable without `git blame`.
Fail loud in development; degrade gracefully in production.
Log at the right level -- `error` for actionable failures, `warn` for recoverable anomalies, `info` for milestones, `debug` for detail.
Logs are structured and greppable, and carry the correlation or trace id (#swe-observability) so lines join across services.
User-facing error text follows #swe-display-messages; internal detail stays in logs and the error object.
For calls that may hit transient failures (network, rate-limit, downstream restart), use exponential backoff with jitter and a bounded retry count; make the retry budget, delay, and jitter named constants (#code-style), not magic numbers.
Do **not** retry a non-idempotent operation unless it is idempotent by design (e.g. via an idempotency key).
