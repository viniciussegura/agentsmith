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

**Reopening.** `resolved` is the author's claim, not the last word: re-emitting a finding id in a later round's review **reopens** it, because a reviewer who still sees the defect is disputing that claim. `guard.mjs` reopens when the review round is later than the round whose rebuttal set the status -- a rebuttal written at that round or later already answers the review, so the status stands. A reopen is **durable**: once reopened, a finding stays open until a rebuttal from the reopen round or later re-settles it, so a later round that simply omits the id does not let the stale pre-reopen `resolved` replay (status is otherwise re-derived from the rebuttal files every run, not preserved by omission the way `tag` is). `wontfix` is never reopened this way: it is the author's decision. A re-emitted `wontfix` is instead a **contested** decision -- the guard yields the `contested` verdict (below) so the dispute reaches the user rather than converging silently.

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
  A specialist sets `origin` to its own role on every `new` finding. **A `reconcile` entry never carries a tag** (only `transition`, spec-internal vocabulary -- not `blocking`/`nit`): tag authority stays with the generalist. **`transition` is advisory, never a status mutation:** `resolved-by-text` reports that the current spec text appears to address the prior finding; it signals the generalist/author but does **not** auto-set `status` -- the author's rebuttal is the only place a status is *authored*, and the reopen rule above is the only other thing that moves one.
- `round-<n>.review.json` -- the generalist's converged review.
  `{ "round": n, "findings": [Finding, ...], "openBlocking": <int> }`
  The generalist's own findings carry `origin: "generalist"`; specialist findings keep their `<role>` origin. `openBlocking` is **informational**: `guard.mjs` computes `b(n)` from the merged ledger and that is authoritative; on divergence it warns and proceeds with its own count.
- `round-<n>.rebuttal.json` -- the author's per-finding statuses (the only authored status source; `guard.mjs` additionally reopens a `resolved` per the rule above).
  `{ "round": n, "statuses": { "<id>": { "status": "resolved" | "wontfix", "note": "..." } } }`
- `ledger.json` -- owned by `guard.mjs`:

```jsonc
{ "meta": { "cycle": 1, "roundsInCycle": 2, "best": 3, "nonProgressStreak": 0, "lastRound": 2 },
  "findings": [
    { /* ...Finding... */ "status": "open",   // "open" | "resolved" | "wontfix"
      "roundRaised": 1,
      "statusRound": 2,                       // round whose rebuttal set `status`; absent while open
      "reopenedAt": 3,                        // round that reopened a `resolved`; absent otherwise
      "tagHistory": [ { "round": 1, "tag": "blocking", "by": "db", "reason": null } ] }
  ] }
```

  `meta.best` is the cycle's lowest `b`; `null` before the cycle's first review. `meta.lastRound` is the highest round number already folded, so a same-`n` re-run of the guard does not double-advance the per-cycle counters. `tagHistory` is the audit trail (every raise + down-tag).
  `statusRound` is what makes the reopen rule decidable -- it is the round the status came from, so a rebuttal written at or after the review that re-raises the finding is recognised as already answering it; it is **absent while the finding is open** (a reopen deletes it). `reopenedAt` records the most recent round that reopened the finding: it is a single scalar, not a history (a finding reopened more than once keeps only the latest round), enough to tell a reopened finding from one never resolved and to make the durability skip decidable -- it is deliberately **not** the append-only audit trail `tagHistory` is.

## Ledger (rendered view)

The human-facing projection of `ledger.json` -- one row per finding id:

| id | origin | tag | status | round raised | note |
|----|--------|-----|--------|--------------|------|

`b(i)` -- the open-blocking count after review `i` -- is the number of findings with `tag: "blocking"` **and** `status: "open"`. It drives the convergence guard (computed by `guard.mjs`, not by hand).

## Rebuttal

Per finding id, the author writes `resolved` (what changed in the spec) or `wontfix` (why not). The next round's reviewer reads the current spec, the latest rebuttal, and the ledger -- not the full history of prior reviews.
