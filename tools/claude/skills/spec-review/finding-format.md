# Finding and ledger format

Spec auto-review (`#ai-spec-review`) is the third application of the role-based
review engine (`#ai-review-engine`). A round's reviewers (the generalist plus any
consulted specialists) and the author exchange the machine artifacts below.

**Authority split (one writer each):** the **generalist owns the `tag`** (and may
down-tag a specialist's blocker to `nit` with a `tagReason`); the **author owns the
`status`** (`resolved`/`wontfix`, via the rebuttal). `guard.mjs` invents neither and
fails closed on a finding missing `origin`/`tag`.

## Finding

Each finding the generalist or a specialist raises:

- **id** -- a short, stable slug drawn from the issue's substance, e.g. `converge-baseline`, `db-migration-unspecified`. Reused verbatim whenever the same issue recurs, so it can be tracked.
- **origin** -- `generalist` or a `<role>` (`db`, `frontend`, ...): which lens raised it. Required from round 1 (in degraded role-play mode the single agent sets it to the lens it is currently role-playing).
- **tag** -- `blocking` (the spec cannot proceed to a plan as-is) or `nit` (minor, optional). Set by the generalist at converge.
- **tagReason** -- present only when the generalist down-tagged the finding (e.g. a specialist `blocking` reframed to `nit`); else omitted.
- **problem** -- one line, citing the spec section.
- **fix** -- a concrete suggested change.

## Status (set by the author in the rebuttal)

- `open` -- raised, not yet resolved.
- `resolved` -- the author changed the spec to address it; state what changed.
- `wontfix` -- the author declined; state why. The reviewer must not re-litigate a `wontfix` finding unless it presents genuinely new information.

A specialist can never close its own finding: it leaves the open-blocking set only by a generalist **down-tag** (tag action, removes it from `b(n)`) or an author **status** of `resolved`/`wontfix`.

## Scratch JSON shapes

Machine artifacts under `.agentsmith/tmp/spec-review/<spec-dir-name>/`. Required
fields only; implementations may add fields. JSON throughout (one parser, every
host, no dependency).

A **Finding** object:

```jsonc
{ "id": "db-migration-unspecified",
  "origin": "db",            // "generalist" | "<role>"
  "tag": "blocking",         // "blocking" | "nit"  (generalist owns this)
  "tagReason": "...",        // only when down-tagged; else omitted
  "problem": "one line, cites a spec section",
  "fix": "concrete suggested change" }
```

- `routing-<n>.json` -- the directive **consumed** by round `n` (round 1: driver bootstrap with empty `questions`; round `n>=2`: emitted by the generalist at the end of round `n-1`).
  `{ "forRound": n, "lenses": ["db", "frontend"], "questions": { "db": ["..."] } }`
  `lenses` is the consult set; the driver re-intersects it with the curated `spec_review: true` registry before spawning.
- `findings/<role>.json` -- one per consulted specialist.
  `{ "role": "db", "new": [Finding, ...], "reconcile": [{ "id": "...", "transition": "still-open" | "resolved-by-text", "note": "..." }, ...] }`
  A specialist sets `origin` to its own role on every `new` finding. **A `reconcile` entry never carries a tag** (only `transition`, spec-internal vocabulary -- not `blocking`/`nit`): tag authority stays with the generalist. **`transition` is advisory, never a status mutation:** `resolved-by-text` reports that the current spec text appears to address the prior finding; it signals the generalist/author but does **not** auto-set `status` -- the author's rebuttal remains the sole status writer.
- `round-<n>.review.json` -- the generalist's converged review.
  `{ "round": n, "findings": [Finding, ...], "openBlocking": <int> }`
  The generalist's own findings carry `origin: "generalist"`; specialist findings keep their `<role>` origin. `openBlocking` is **informational**: `guard.mjs` computes `b(n)` from the merged ledger and that is authoritative; on divergence it warns and proceeds with its own count.
- `round-<n>.rebuttal.json` -- the author's per-finding statuses (sole status source).
  `{ "round": n, "statuses": { "<id>": { "status": "resolved" | "wontfix", "note": "..." } } }`
- `ledger.json` -- owned by `guard.mjs`:

```jsonc
{ "meta": { "cycle": 1, "roundsInCycle": 2, "best": 3, "nonProgressStreak": 0 },
  "findings": [
    { /* ...Finding... */ "status": "open",   // "open" | "resolved" | "wontfix"
      "roundRaised": 1,
      "tagHistory": [ { "round": 1, "tag": "blocking", "by": "db", "reason": null } ] }
  ] }
```

  `meta.best` is the cycle's lowest `b`; `null` before the cycle's first review. `tagHistory` is the audit trail (every raise + down-tag).

## Ledger (rendered view)

The human-facing projection of `ledger.json` -- one row per finding id:

| id | origin | tag | status | round raised | note |
|----|--------|-----|--------|--------------|------|

`b(i)` -- the open-blocking count after review `i` -- is the number of findings with `tag: "blocking"` **and** `status: "open"`. It drives the convergence guard (computed by `guard.mjs`, not by hand).

## Rebuttal

Per finding id, the author writes `resolved` (what changed in the spec) or `wontfix` (why not). The next round's reviewer reads the current spec, the latest rebuttal, and the ledger -- not the full history of prior reviews.
