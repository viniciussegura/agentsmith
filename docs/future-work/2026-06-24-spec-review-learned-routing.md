# Future work: spec-review learned routing

Date: 2026-06-24
Status: Deferred (`#swe-future-work`)
Context: `docs/working-specs/2026-06-24-spec-review-specialist-fanout/`

## The gap

In the spec-review specialist fan-out, **round 1** has no prior generalist directive, so the **driver** bootstraps the specialist set by mapping spec content to candidate lenses (`routing-1.json`), biasing to include when unsure. This bootstrap is a heuristic: it can over-consult (a wasted cheap sub-agent) or, worse, miss a relevant lens at round 1 (a domain blocker surfaces a round later than it could).

## The deferred improvement

**Learned routing:** before round 1, run the **generalist** on a cheap dry pass whose only job is to read the spec and propose the round-1 lens set + the per-lens directed questions -- i.e. let the judge route round 1 too, instead of the driver's heuristic. The generalist already owns routing for rounds 2+; this extends the same authority to round 1 at the cost of one extra cheap dispatch.

Only worth building if the bootstrap heuristic proves weak in practice (observed missed or over-consulted lenses). Until then the driver bootstrap is the simpler default.

## Related

- A `guard.mjs summary` projection step (additive) if a curated `spec_review` set ever grows large enough that the generalist's direct ingestion of specialist findings becomes a cost (today it is bounded by finding count over <=6 lenses; see the spec's Token discipline).
