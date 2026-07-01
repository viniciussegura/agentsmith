# #swe-technical-debts Technical debt

Each accepted shortcut or known limitation gets a file in the technical-debts directory (#swe-docs-layout), stating the debt, why it was accepted, its cost or risk, and a remediation sketch.
Record it the moment it is incurred.
The directory holds only open debts: when remediation ships, delete the file in the same change -- git history preserves the record (`git log -- docs/technical-debts/`).
Before starting non-trivial work in an area, scan `docs/technical-debts/` for entries whose scope overlaps: a live debt may constrain the new work or make it the right time to pay it off.
Deferred work that is not a shortcut or limitation belongs in `docs/future-work/` (#swe-future-work), not here.
