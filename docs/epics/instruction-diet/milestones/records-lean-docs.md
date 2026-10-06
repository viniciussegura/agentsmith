# records -- one records doc, a lean README, and notes that cannot sprawl

## records-1 `records-merge`

**Outcome.** The two reference-spec documents about record types become one: the record table, the remapping pointer, and the citation convention; the records design decision keeps rationale only.
**Depends on.** --
**Blocks.** `rule-rewrite`
**Acceptance.** The reference spec holds one document about record types and every inbound link resolves.
**State.** planned

## records-2 `readme-diet`

**Outcome.** The README summarizes the docs-layout remap in a few lines and links a dedicated document; the working-spec upgrade note is gone; a changelog exists and the pre-release rule names it.
**Depends on.** --
**Blocks.** --
**Acceptance.** The README is under 200 lines and the changelog carries the current pre-release.
**State.** planned

## records-3 `note-template`

**Outcome.** A future-work note and a technical-debt note each have a fixed-heading template; evidence and provenance go to the PR body, not the note.
**Depends on.** --
**Blocks.** `note-cap`
**Acceptance.** The owner rules name the template and every existing note conforms.
**State.** planned

## records-4 `note-cap`

**Outcome.** A test fails when a future-work or debt note exceeds a line cap or carries a heading outside the template.
**Depends on.** `note-template`
**Blocks.** --
**Acceptance.** The suite includes the cap and every existing note passes.
**State.** planned
