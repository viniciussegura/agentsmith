# Finding and ledger format

## Finding

Each finding the reviewer raises has:

- **id** -- a short, stable slug drawn from the issue's substance, e.g. `converge-baseline`, `stall-predicate`. Reused verbatim whenever the same issue recurs in a later round, so it can be tracked.
- **tag** -- `blocking` (the spec cannot proceed to a plan as-is) or `nit` (minor, optional).
- **problem** -- one line, citing the spec section.
- **fix** -- a concrete suggested change.

## Status (set by the author in the rebuttal)

- `open` -- raised, not yet resolved.
- `resolved` -- the author changed the spec to address it; state what changed.
- `wontfix` -- the author declined; state why. The reviewer must not re-litigate a `wontfix` finding unless it presents genuinely new information.

## Ledger

A running table across all rounds, one row per finding id:

| id | tag | status | round raised | note |
|----|-----|--------|--------------|------|

`b(i)` -- the open-blocking count after review `i` -- is the number of rows with tag `blocking` and status `open`. It drives the convergence guard.

## Rebuttal

Per finding id, the author writes: `resolved` (what changed in the spec) or `wontfix` (why not). The next round's reviewer reads the current spec, the latest rebuttal, and the ledger -- not the full history of prior reviews.
