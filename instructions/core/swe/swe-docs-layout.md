# #swe-docs-layout Documentation layout

| path | description | owner |
| --- | --- | --- |
| `docs/reference-spec/<name>.md` | the living present-truth of the system | #swe-reference-spec |
| `docs/design-decisions/<decision-slug>.md` | the standing *why* behind cross-cutting choices | #swe-design-decisions |
| `docs/technical-debts/<YYYY-MM-DD>-<slug>.md` | open accepted shortcuts or known limitations | #swe-technical-debts |
| `docs/future-work/<YYYY-MM-DD>-<slug>.md` | deferred or out-of-scope items | #swe-future-work |
| `docs/epics/<slug>/` | a multi-deliverable initiative: roadmap, milestones, and units of work | #swe-epic |

<!-- agentsmith:external-note -->
A row whose location reads `external` is served by that system, not by a file in this repo; the record's durable home is an item there, the framing #ai-review-board applies to a promoted board finding.
Every obligation the owner rule states applies to that item: **record** it where the rule says to record, **scan** that system where the rule says to scan the directory, **update** the item where the rule says to update the file, and **close** it where the rule says to delete the file.
Where you cannot reach that system, say so to the user and hand them what you would have filed, or ask them to check or close the item; never treat a system you could not scan as empty, and never write a substitute file.
The label is a human-readable hint, not an address.
This redirects **location and registration only**: it grants no exception to any other rule, and never to the safety baseline.
<!-- /agentsmith:external-note -->
