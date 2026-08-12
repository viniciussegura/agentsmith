# `POST /api/apply` is tested by an assertion that can essentially only fail on a 404

Recorded 2026-08-12, during the temp-directory cleanup fix (`fix/test-temp-dir-cleanup`).

## What

`test/triage-server.test.mjs`'s `POST /api/apply` test asserts only that the status is neither 404 nor 423.
200 (applied), 409 (dirty-base preflight) and 500 (apply error) all pass.
It also reaches the route's real preflight, which runs `git status --porcelain` against the working tree rather than a fixture, so which of those three it gets depends on whether the developer's tree happens to be dirty.

The test therefore verifies that the route is registered, and nothing else.

## Why it matters

`#swe-test-quality` requires a test to be able to fail on the behavior it claims to cover.
This one can fail only if the route is removed or renamed, so a broken apply path ships green.
The ambient git dependency is the same rule's determinism miss: the identical test yields 200 or 409 on the same commit depending on working-tree state.

The in-code comment already explains why the 423 lock path cannot be exercised from an in-process test, so the weak assertion was a deliberate call, not an oversight.
This note exists because that call is invisible to the next reader, who will otherwise rediscover it and re-litigate it.

## Constraints

Fixing it means injecting the git-state probe and the apply executor so the test can drive 200, 409 and 500 deliberately, which is a redesign of the route's boundary rather than a test edit.
Do that when `/api/apply` is next changed for its own reasons; a standalone branch for it buys a stronger assertion on a devtools-only route.

Raised as `2026-08-11a#qa-2` by the code-review board, whose store is local and per-machine -- this file is the committed record.

## Why it was deferred

Out of scope for `fix/test-temp-dir-cleanup`, which threaded a `t` parameter through this test's signature and changed no assertion.
Redesigning the route's seam from a mechanical cleanup branch would widen it well past its approved scope.
