# conformance -- the repo obeys its own rules

Four small fixes, all mechanical, shipped together on `fix/self-conformance`.

## conformance-1 `hide-email`

**Outcome.** No personal email address in any committed file; the plugin manifests carry the owner name only.
**Depends on.** --
**Acceptance.** `git grep -n '@gmail.com\|@hotmail.com'` matches only the rule that names the pattern.
**State.** in-progress

## conformance-2 `sentinel-debt`

**Outcome.** `#swe-prompt-injection-sentinel` and the `DATA_OPEN`/`DATA_CLOSE` constants state one sentinel form, a test fails when they diverge, and the 2026-07-30 debt note is deleted.
**Depends on.** --
**Acceptance.** `docs/technical-debts/` holds no sentinel note; `npm test` has a test reading the rule module against the constants.
**State.** in-progress

## conformance-3 `role-field`

**Outcome.** The code-review store derives an issue's directory from its id, never from an undeclared `role` field, and the 2026-08-11 future-work note is deleted.
**Depends on.** --
**Acceptance.** A persist test with findings that carry no `role` field writes under `issues/<role>/`, never `issues/undefined/`.
**State.** in-progress

## conformance-4 `protocol-doc`

**Outcome.** `review-board-protocol.md` opens with the round; the Workflow runtime constraints live in `CONTRIBUTING.md` as a build note.
**Depends on.** --
**Acceptance.** The protocol document's first section after its preamble is the containment guard or the round.
**State.** in-progress
