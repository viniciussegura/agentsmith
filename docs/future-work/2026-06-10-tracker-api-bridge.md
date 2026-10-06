# Official-tracker API bridge for board promotion

## What

Promote board issues into GitHub or Jira programmatically, instead of a human pasting the URL into `/review-promote`.

## Why it matters

It removes the manual copy step while keeping promotion the human-validation gate; the issue store already carries `promotedTo`.

## Constraints

- Auth and secret handling per `#swe-security` and `#swe-environment`: tokens never logged or committed.
- Stays opt-in and never auto-pushes, a non-goal of the board's design; idempotent like `/review-promote`.
- An HTTP boundary is new surface for an otherwise local, file-based tool.
