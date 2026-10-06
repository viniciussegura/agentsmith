# #swe-future-work Future work

Deferred or out-of-scope work gets a file in the future-work directory (#swe-docs-layout).
As a file, a note is an H1 title followed by the sections `## What`, `## Why it matters`, and `## Constraints` (omitted when there are none), in that order, and nothing else, written per #code-prose; as a tracker item it states the same three in the same order.
An alternative considered stays, one line under What with why it is not the recommendation; evidence, provenance, and deliberation go to the PR body that records the deferral (#git-pr), which also lists a note it deleted or split.
Record it when the decision to defer is made, not later.
Before starting non-trivial work in an area, scan the future-work directory (#swe-docs-layout) for entries whose scope overlaps: a deferred item may carry constraints or dependencies the new work must respect.
