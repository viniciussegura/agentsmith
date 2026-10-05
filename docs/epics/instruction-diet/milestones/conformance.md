# conformance -- the repo obeys its own rules

Four small, mechanical fixes shipped together on one branch.

## conformance-1 `hide-email`

**Outcome.** No personal email address in any committed file; the plugin manifests carry the owner name only.
**Depends on.** --
**Blocks.** --
**Acceptance.** The personal-address grep that `#swe-environment` prescribes matches only that rule.
**State.** in-progress

## conformance-2 `sentinel-debt`

**Outcome.** The sentinel rule and the review-board implementation state one sentinel form, a test fails when any prose site diverges from it, and the open debt note is closed.
**Depends on.** --
**Blocks.** --
**Acceptance.** No sentinel debt remains recorded; the suite sweeps every tracked document for the form.
**State.** in-progress

## conformance-3 `role-field`

**Outcome.** The code-review store derives an issue's directory from its id and refuses a malformed accepted finding before writing anything; the open future-work note is closed.
**Depends on.** --
**Blocks.** --
**Acceptance.** A finding with no role field is filed under its role; a malformed accepted finding halts persistence with nothing written.
**State.** in-progress

## conformance-4 `protocol-doc`

**Outcome.** The round protocol document opens with the round; the Workflow runtime constraints live in the contributor guide as a build note.
**Depends on.** --
**Blocks.** --
**Acceptance.** The protocol document's first section after its preamble describes the round or its guard.
**State.** in-progress
