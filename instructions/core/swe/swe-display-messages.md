# #swe-display-messages Display messages

A message is written for whoever reads it -- a UI end user, another service consuming your error response, or a developer reading a log.
Make every message (especially information, warning, and error messages) as human-readable as possible for that audience.
Keep deeper reporting detail available but separate from the headline: the primary message states what happened and what to do, while the diagnostic detail (call stack, raw upstream response, correlation id) stays retrievable without being forced on the reader.
How that detail is revealed is a presentation-layer choice -- a "show more"/"copy details" affordance in a UI, a `details` field in an error response, a structured field in a log line -- and is governed by the relevant presentation rule.
