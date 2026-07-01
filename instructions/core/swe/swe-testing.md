# #swe-testing Testing

Write tests test-first: a failing test before the code that satisfies it.
Every bug fix starts with a test that reproduces the bug.
Assert against the public surface, not internals; the default is tests authored independently of the implementation -- the only accepted exception is solo work with no reviewer, where a deliberate gap between writing the code and writing its tests is the minimum substitute.
Tests live beside the code or under `test/`, mirroring the source layout.
A change is not done until its tests pass locally (#swe-done).
Tests **MUST** be runnable with a single documented command (e.g. `npm test`, `pytest`, `cargo test`) -- a test file the standard harness cannot invoke does not satisfy #swe-done.
Use the tier that gives the tightest feedback for the scope changed: unit tests for pure logic; integration tests at the boundary where components meet infrastructure (database, external service, file system); end-to-end tests only for behavior unverifiable at a lower tier.
Do not substitute a higher tier to avoid a lower one: an integration test wrapping a pure function is not a unit test and does not replace it.
For test credibility -- no tautologies, edge-case coverage, determinism, fixture hygiene, and rules on doubles -- see #swe-test-quality.
