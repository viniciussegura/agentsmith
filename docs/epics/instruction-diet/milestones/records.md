# records -- one records doc, a lean README, and notes that cannot sprawl

## records-1 `records-merge`

**Outcome.** `documentation-model.md` and `documentation-layout.md` become one reference-spec document, `records.md`: the record table, remapping pointer, and citation convention. `records-architecture.md` keeps rationale only.
**Depends on.** --
**Acceptance.** `docs/reference-spec/` holds one document about record types; every inbound link resolves.
**State.** planned

## records-2 `readme-diet`

**Outcome.** The README summarizes the docs-layout remap in a few lines and links a dedicated document; the "Upgrading: working specs" note is gone; a `CHANGELOG.md` exists and the pre-release rule names it.
**Depends on.** --
**Acceptance.** README under 200 lines; `CHANGELOG.md` present with the current pre-release.
**State.** planned

## records-3 `note-template`

**Outcome.** A future-work note and a technical-debt note each have a fixed-heading template; evidence and provenance material goes to the PR body, not the note.
**Depends on.** --
**Acceptance.** The owner rules name the template; existing notes conform.
**State.** planned

## records-4 `note-cap`

**Outcome.** A test fails when a future-work or debt note exceeds a line cap or carries a heading outside the template.
**Depends on.** `note-template`
**Acceptance.** `npm test` includes the cap; every existing note passes.
**State.** planned
