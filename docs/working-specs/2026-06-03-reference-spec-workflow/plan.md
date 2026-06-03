# Plan: Reference-spec workflow

Date: 2026-06-03
Spec: `spec.md` (approved)
Status: Implemented

Executes Move B of the approved spec -- a rules-only change in `instructions/core/`.
All edits are exact string replacements (line numbers below are indicative; the match is by text, so insertion order does not matter).
No files are created under `docs/reference-spec/`.
Lands on the current session branch (`working-specs-layout`).

## Step 1 -- Add `#swe-reference-spec` to `swe.md`

Insert a new section in `instructions/core/swe.md` immediately after `#swe-entity` and before `#swe-docs-drift`, with this body (from the spec's Design):

```markdown
## #swe-reference-spec Reference spec

The reference spec is the living description of the system as it currently is -- the single place to learn what the software does now.
It lives under `docs/reference-spec/`, created lazily when the first reference document is warranted, never preemptively.
It is the counterpart to working specs and plans (#ai-plan): those are immutable point-in-time history, while the reference spec is mutable and always reflects the present.
When the two disagree, the reference spec wins; a working spec is never consulted for current truth.
A reference-spec document carries no `Status:` line: the `Draft`/`Approved`/`Implemented` lifecycle (#ai-plan) belongs to working specs and plans, whereas the reference spec has no states -- only the current truth.
The entity model (#swe-entity) is its first and canonical member.
Upkeep is not a separate mechanism: the reference spec is kept current under #swe-docs-drift and gated by #swe-done -- after a change ships, the reference spec is checked and any drift fixed in the same PR.
Where the two could be confused, use the qualified terms "working spec" and "reference spec" (#swe-terminology, #swe-naming); a bare "spec" is fine only where context makes which one unambiguous.
```

## Step 2 -- Re-home `#swe-entity` (`swe.md` line ~42)

Replace the single line:
- Before: `Core entities (_aka_ core concepts or core abstractions) are documented in `docs/entity-model.md` and follow rule #swe-terminology.`
- After: `Core entities (_aka_ core concepts or core abstractions) are documented in the entity model, `docs/reference-spec/entity-model.md` -- the canonical member of the reference spec (#swe-reference-spec) -- and follow rule #swe-terminology.`

## Step 3 -- Extend `#swe-docs-drift` (`swe.md` line ~52)

- Before: `This includes -- but is not limited to -- the entity model (#swe-entity), any `README` or `CONTRIBUTING` file at any level, and files under `docs/`.`
- After: `This includes -- but is not limited to -- the reference spec (#swe-reference-spec) and its entity model (#swe-entity), any `README` or `CONTRIBUTING` file at any level, and files under `docs/`.`

## Step 4 -- Extend `#swe-done` item 2 (`swe.md` line ~103)

- Before: `2. Documentation drift is resolved (#swe-docs-drift), including the entity model when the schema changed (#swe-entity).`
- After: `2. Documentation drift is resolved (#swe-docs-drift), including the reference spec when current behavior changed (#swe-reference-spec) and the entity model when the schema changed (#swe-entity).`

## Step 5 -- Resolve the dangling reference in `#ai-plan` (`ai.md` line ~22)

- Before: `- A spec or plan is append-only history once `Approved`; corrections to the live system go to the reference spec, never back into the artifact that predates them.`
- After: `- A spec or plan is append-only history once `Approved`; corrections to the live system go to the reference spec (#swe-reference-spec), never back into the artifact that predates them.`

## Step 6 -- Verify

Run the spec's Verification block (POSIX shell / Grep tool):

- `#swe-reference-spec` defined exactly once in `swe.md`, between `#swe-entity` and `#swe-docs-drift`.
- Each of the four "After" strings is present in its target file; none of the four "Before" strings remains.
- `grep -rn "docs/entity-model.md" instructions/` returns nothing.
- `git status` shows changes only under `instructions/`; `git ls-files docs/reference-spec` is empty.
- Every `#`-tag in the edited rules resolves (no dangling tag); `#ai-plan` contains the literal `go to the reference spec (#swe-reference-spec)`.

## Out of scope

The first actual reference document (entity model or current-system description) -- authored when a real need arises.

## Verification of done (#swe-done)

- Verification block passes.
- Docs drift: this change *is* the rule edit; no other doc references the old entity-model path or an undefined reference spec.
- No dependencies touched; no shortcuts to record.
- Self-reviewed against the instruction set.
