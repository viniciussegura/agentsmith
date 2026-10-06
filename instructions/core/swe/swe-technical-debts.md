# #swe-technical-debts Technical debt

Each accepted shortcut or known limitation gets a file in the technical-debts directory (#swe-docs-layout).
As a file, a note is an H1 title followed by the sections `## The debt`, `## Why accepted`, `## Cost / risk`, and `## Remediation sketch`, in that order, and nothing else, written per #code-prose; as a tracker item it states the same four in the same order: a debt nobody reads constrains nobody.
Record it the moment it is incurred.
The directory holds only open debts: when remediation lands, delete the file in the same change -- git history preserves the record (`git log` on the directory).
Before starting non-trivial work in an area, scan the technical-debts directory (#swe-docs-layout) for entries whose scope overlaps: a live debt may constrain the new work or make it the right time to pay it off.
Deferred work that is not a shortcut or limitation belongs in the future-work directory (#swe-future-work), not here.
