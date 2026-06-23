# #swe-display-messages Display messages

A message is written for whoever reads it -- a UI end user, another team consuming your service's error response, or a developer reading a log.
Make every message (especially information, warning, and error messages) as human-readable as possible for that audience.
Keep deeper reporting detail available (_e.g._ call stack for errors, raw backend response) but initially hidden behind a "show more details" or "copy details to clipboard".
