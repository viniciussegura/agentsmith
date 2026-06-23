# #swe-observability Observability

Beyond logging (#swe-errors), expose the signals needed to see the system's health.
At minimum, every externally-called operation (HTTP endpoint, queue consumer, scheduled job) emits latency and error-count signals.
A request crossing services carries one correlation or trace id end to end.
Provide a health or readiness check for any long-running service.
Keep signals actionable -- enough to locate a failure, not vanity counters.
