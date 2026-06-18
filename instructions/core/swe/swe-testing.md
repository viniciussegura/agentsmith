# #swe-testing Testing

Write tests test-first: a failing test before the code that satisfies it.
Every bug fix starts with a test that reproduces the bug.
Assert against the public surface, not internals; the default is tests authored independently of the implementation -- the only accepted exception is solo work with no reviewer, where a deliberate gap between writing the code and writing its tests is the minimum substitute.
Tests live beside the code or under `test/`, mirroring the source layout.
A change is not done until its tests pass locally (#swe-done).
