# Additional reviewer roles: performance, accessibility, scalability

## What

New lenses in the shared role registry: `performance` (hot paths, allocations, query and N+1 cost), `accessibility` (a dedicated a11y lens beyond `frontend`'s `#front-a11y`), and `scalability` (load, concurrency, data-growth behavior).

## Why it matters

They benefit both applications of the review engine (code review and instruction review) the way the existing lenses do, sharpening coverage no current lens owns well.

## Constraints

- Each needs a reviewer persona (`tools/claude/agents/review-<id>.md`), a `roles.yaml` row, gating globs and keywords in the default `config.yaml`, and, if it owns instruction rules, ownership rows in `ownership.yaml`, which the coverage lint demands.
- Splitting `accessibility` out of `frontend` means re-adjudicating which `#front-a11y` and `#ui-*` tags it owns.
