# #swe-test-quality Test credibility

A test must be able to fail: assert observable behavior, never that code merely ran; no tautologies or unread snapshots.
Cover the error paths and edge cases the change adds, not just the happy path.
Keep tests deterministic -- no real clock, order, locale, network, or unseeded RNG; a test that flakes counts as failing (#swe-done), fixed at the source or quarantined with a tracked record (#swe-future-work).
Fixtures use synthetic data (#swe-environment, #swe-security), isolated per test, kept in step with the schema.
When a schema or entity-model change ships (#swe-entity), update the affected fixtures in the same change and confirm the tests still exercise the new shape -- a fixture silently passing against a stale schema is a false green.
Do not mock the subject under test -- a test that validates a mock of the thing it claims to verify proves nothing; doubles for infrastructure boundaries (network, filesystem, external services, clock) are legitimate, scoped to the boundary, not the logic.
