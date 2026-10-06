# `POST /api/apply` is tested by an assertion that can only fail on a 404

## What

`test/triage-server.test.mjs`'s `POST /api/apply` test asserts only that the status is neither 404 nor 423, so 200 (applied), 409 (dirty-base preflight), and 500 (apply error) all pass, and which one it gets depends on whether the developer's working tree is dirty, because the route's preflight runs `git status --porcelain` against the real tree.
Inject the git-state probe and the apply executor so the test can drive 200, 409, and 500 deliberately; that is a redesign of the route's boundary, so do it when `/api/apply` is next changed for its own reasons.

## Why it matters

`#swe-test-quality` requires a test to be able to fail on the behavior it claims to cover; this one fails only if the route is removed or renamed, so a broken apply path ships green, and the ambient git dependency makes the same commit yield 200 or 409 on different trees.
The in-code comment explains why the 423 lock path cannot be exercised in process, so the weak assertion was a deliberate call; this note keeps that call visible so the next reader does not re-litigate it.

## Constraints

- A standalone branch buys a stronger assertion on a devtools-only route, so the change rides on the next functional change to the route.
