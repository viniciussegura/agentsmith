# Spec-review learned routing

## What

In the spec-review fan-out, round 1 has no prior generalist directive, so the driver bootstraps the specialist set by mapping spec content to candidate lenses, biasing to include when unsure.
Let the generalist route round 1 too: a cheap dry pass that reads the spec and proposes the round-1 lens set and per-lens questions, extending the authority it already has for rounds 2 and later at the cost of one extra dispatch.
A related deferral: a summary projection step in `guard.mjs` if the curated `spec_review` set grows large enough that direct ingestion of specialist findings becomes a cost.

## Why it matters

The bootstrap is a heuristic: it can over-consult (a wasted cheap subagent) or miss a relevant lens at round 1, so a domain blocker surfaces a round later than it could.

## Constraints

- Only worth building if the heuristic proves weak in practice (observed missed or over-consulted lenses); until then the driver bootstrap is the simpler default.
