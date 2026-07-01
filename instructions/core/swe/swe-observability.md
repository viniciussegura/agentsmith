# #swe-observability Observability

Beyond logging (#swe-errors), expose the signals needed to see the system's health.
Every operation exposed to a caller (HTTP endpoint, queue consumer, scheduled job) emits latency and error-count signals.
Every outbound call to a dependency (an HTTP request, a database query, a queue publish, a third-party API) emits latency, failure, and retry signals, so a failure originating downstream is attributable rather than surfacing only as a local timeout.
A request crossing services carries one correlation or trace id end to end.
Provide a health or readiness check for any long-running service.
Keep signals actionable -- enough to locate a failure, not vanity counters.
