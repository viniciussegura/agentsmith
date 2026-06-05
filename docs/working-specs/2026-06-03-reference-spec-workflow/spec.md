# Spec: Reference-spec workflow

Date: 2026-06-03
Status: Implemented

## Motivation

Move A made working specs and plans immutable point-in-time history and, in `#ai-plan`, sent "corrections to the live system" to a **reference spec** that does not yet exist as a concept.
That clause is currently a dangling forward reference.

Move B closes it by defining the reference spec: the living description of what the system does *now*, the counterpart to the frozen working specs.
This is the "single source of current truth" half of the two-part model -- the part that makes treating working specs as disposable history safe, because there is one place that is always kept current.

Two facts shape the scope.
`docs/entity-model.md`, referenced by `#swe-entity`, was never actually created -- so there is nothing to relocate, only a rule to re-home.
And the decision is to organize the **workflow in the instructions**, not to seed repository content: `docs/reference-spec/` is defined and created lazily when the first reference document is warranted, never preemptively.
So Move B is a rules-only change with no new files under `docs/`.

## Goals

- Define the reference spec as a first-class concept: what it is, where it lives, how it differs from working specs.
- Re-home the entity model (`#swe-entity`) as the reference spec's canonical member.
- Resolve the dangling "reference spec" reference in `#ai-plan`.
- Enforce upkeep by reusing existing machinery -- `#swe-docs-drift` plus a `#swe-done` item -- with no parallel forcing function.
- Guard the terminology so "spec" is never bare for these two distinct artifacts.

## Non-goals

- Creating `docs/reference-spec/` or any file inside it now; the directory appears with its first warranted document, post-B.
- Authoring a reference document describing agentsmith's current system (build pipeline, bundles, CLI); that is real content, written when needed, not part of this rules change.
- A new standalone upkeep rule or cadence; upkeep is delegated to `#swe-docs-drift` and `#swe-done`.
- Backfilling the missing `docs/reference-spec/entity-model.md`; its absence predates this change and stays lazy (created when entities are first documented).

## Design

### The concept

The reference spec is the living, mutable description of the system as it currently is -- the single place to learn what the software does now.
It is the counterpart to working specs and plans (`#ai-plan`): those are immutable point-in-time history; the reference spec always reflects the present.
When the two disagree, the reference spec wins; a working spec is never consulted for current truth.
It lives under `docs/reference-spec/`, created lazily when the first reference document is warranted.
The entity model is its first and canonical member.

### New rule: `#swe-reference-spec`

Added to `instructions/core/swe.md`, immediately after `#swe-entity` (both concern living current-state docs), before `#swe-docs-drift`:

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

### Edits to existing rules (verbatim)

Each edit is a single-line replacement; the surrounding lines are unchanged.

**`#swe-entity`** (`swe.md` line 42) -- re-home and name membership:

- Before: `Core entities (_aka_ core concepts or core abstractions) are documented in \`docs/entity-model.md\` and follow rule #swe-terminology.`
- After: `Core entities (_aka_ core concepts or core abstractions) are documented in the entity model, \`docs/reference-spec/entity-model.md\` -- the canonical member of the reference spec (#swe-reference-spec) -- and follow rule #swe-terminology.`

**`#swe-docs-drift`** (`swe.md` line 52) -- call out the reference spec:

- Before: `This includes -- but is not limited to -- the entity model (#swe-entity), any \`README\` or \`CONTRIBUTING\` file at any level, and files under \`docs/\`.`
- After: `This includes -- but is not limited to -- the reference spec (#swe-reference-spec) and its entity model (#swe-entity), any \`README\` or \`CONTRIBUTING\` file at any level, and files under \`docs/\`.`
- Note on redundancy: "files under `docs/`" already subsumes `docs/reference-spec/`, but the reference spec is named explicitly for the same reason the entity model already is -- to make the obligation unmissable, not to extend coverage.

**`#swe-done`** (`swe.md` line 103, item 2) -- gate reference-spec drift:

- Before: `2. Documentation drift is resolved (#swe-docs-drift), including the entity model when the schema changed (#swe-entity).`
- After: `2. Documentation drift is resolved (#swe-docs-drift), including the reference spec when current behavior changed (#swe-reference-spec) and the entity model when the schema changed (#swe-entity).`

**`#ai-plan`** (`ai.md` line 22) -- resolve the dangling reference:

- Before: `- A spec or plan is append-only history once \`Approved\`; corrections to the live system go to the reference spec, never back into the artifact that predates them.`
- After: `- A spec or plan is append-only history once \`Approved\`; corrections to the live system go to the reference spec (#swe-reference-spec), never back into the artifact that predates them.`

### Terminology guard

"Working spec" and "reference spec" are distinct concepts that both contain the word "spec".
The guard is scoped, not absolute: where the two could be confused -- chiefly cross-rule and cross-document references -- the qualified term is required (`#swe-terminology` keeps the concepts distinctly named, `#swe-naming` fixes the qualified form).
A bare "spec" stays fine where context makes which one unambiguous -- e.g. inside `#ai-plan`, whose subject is the working spec, "a spec or plan" needs no qualifier.
This deliberately does not turn `#ai-plan`'s existing bare usages into drift bugs.
Any current-system reference document is a kind of reference-spec content, not a new term ("system spec" is avoided to keep the vocabulary to two).

## Reference updates

All edits land in `instructions/core/` (the committed source); the `.agentsmith/` bundle is regenerated at build time and is gitignored, so there is nothing committed to regenerate.

| File | Change |
|---|---|
| `instructions/core/swe.md` | Add `#swe-reference-spec`; edit `#swe-entity` path + membership; extend `#swe-docs-drift` list; extend `#swe-done` item 2 |
| `instructions/core/ai.md` | Add `(#swe-reference-spec)` cross-ref to the `#ai-plan` reference-spec clause |

No tooling (`tools/`), skill, or command references the entity model or reference spec, so none change.

## Verification

These assume a POSIX shell (Bash tool) on this Windows env; use the Grep tool otherwise.
Scope: only `#`-tag references must resolve. Filesystem path references to the lazily-created reference spec (`docs/reference-spec/...`) are intentional and excluded from any "referenced file exists" check.

- `#swe-reference-spec` is defined exactly once in `instructions/core/swe.md` and sits between `#swe-entity` and `#swe-docs-drift`.
- Every `#`-tag referenced in the edited rules resolves to a defined section; no dangling tag remains -- in particular `#ai-plan` now contains the literal `go to the reference spec (#swe-reference-spec)`.
- Each of the four verbatim "After" strings (above) is present in its target file, and none of the four "Before" strings remains.
- `grep -rn "docs/entity-model.md" instructions/` returns nothing; the only entity-model path is `docs/reference-spec/entity-model.md`.
- No file is created under `docs/reference-spec/`: `git status` shows changes only under `instructions/`, and `git ls-files docs/reference-spec` is empty.
- Committed surface only: the testable target is `instructions/core/`. The `.agentsmith/` bundle is a gitignored build output; regenerating it (`node bin/cli.js`) is optional and asserts nothing committed.

## Out of scope

- The first actual reference document (entity model, or a current-system description) -- authored when a real need arises, under the workflow this spec establishes.
