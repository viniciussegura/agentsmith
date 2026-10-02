# Documentation layout

The standard every documentation folder follows, and how a consumer project remaps one.
A member of the reference spec (`#swe-reference-spec`): it reflects the convention as it is **now** and carries no `Status:` line.

## The separation of concerns

A documentation folder has two facets, kept in two homes:

- **Location and intent** -- the path, the naming pattern, and a one-line statement of what the folder holds. 
  These live once, in the layout map (`#swe-docs-layout`), the single source of truth for every documentation location and naming pattern.
- **Lifecycle** -- when a file is created, what it must state, when it is deleted, who consults it. 
  This lives in the folder's owner rule (e.g. `#swe-technical-debts`, `#ai-plan`), which cites the map for location and **never** restates the path pattern.

The two cross-reference: the map points at each owner rule for behavior, the owner rule points at the map for location.

The map carries one clause beyond a path: for a row served by an external system, the redirect that sends every obligation the owner rule states -- record, scan, update, close -- to an item in that system instead of a file.
That is location and registration, not lifecycle, so the separation holds.
The map is also the only home the clause can have: an owner rule is static text, identical for every project, so it cannot carry a per-project redirect, and only the map is rewritten per project.

## Why

A folder's path and naming pattern have exactly one home, so renaming or relocating a folder is a one-place edit and cannot drift between rules. 
The deliberate cost is cohesion: learning both *where* a folder is and *how* it behaves now spans two rules (a tension with `#swe-deep-modules`), accepted because path drift is the more damaging failure.

## Scope: every documentation location

The map is the single source of truth for every documentation location and naming pattern, and for nothing else.
Each row's shipped value sits under `docs/`, which is the **default** rather than the boundary: a consumer project remaps a row to any path in its repo, or -- for the two rows eligible for it -- to an external system that serves the record instead of a file.

A store outside the map is named directly in its owner rule: the gitignored working-spec store at `.agentsmith/specs/` (`#ai-plan`), the review-board store at `.agentsmith/review-board/` (`#ai-review-board`).
That is not a breach of the separation above: those paths are per-machine working state, not documentation, and they have exactly one home either way.
Being outside the map, they are also not remappable -- the same statement from the other side.

## Remapping

A project declares its real layout in `.agentsmith/docs-layout.yaml`, keyed by each row's bare owner tag, and the generator rewrites the emitted table to match ([README](../../README.md#remapping-the-documentation-layout), [`cli.md`](./cli.md)).
Two of the map's own properties are what make that work: every owner rule cites the map rather than restating a path, so one rewritten cell reaches every reader; and the owner tag is the row's identity, because the path is the thing being overridden and cannot also identify it.

Two facts about a row are policy rather than table data -- whether it may be `external`, and which placeholder token a relocated path must retain -- so neither is inferable from the `path`/`description`/`owner` columns.
Both live in a per-row policy constant, `ROW_POLICY` in [`src/docslayout.js`](../../src/docslayout.js), keyed by the same bare owner tag and deny-by-default: a tag absent from it is ineligible for `external` and requires no placeholder.
A third fact is table data and stays there: a default path ending in `/` declares that the row stores each record as its own directory, so an override of that row must end in `/` too.
Validation also compares the rows against each other -- a row keeps its default path until overridden, and no two may resolve to one location, since the owner rules tell an agent to scan a directory for every record of one type.
A row's location is the fixed part of its path, up to its first placeholder; everything from that placeholder on names one record.
What the row claims at that location follows from whether the naming segment is a directory -- because a slash follows it, or because more segments do: a row whose records are directories claims every directory there, one whose records are files claims the files, which is why a row may sit flat in `docs/` only in the second form.

The external-row redirect above is conditional rule text, carried in the rule source between `<!-- agentsmith:external-note -->` and `<!-- /agentsmith:external-note -->`.
The generator keeps the enclosed text and drops the two marker lines when at least one row is `external`; otherwise it strips the block whole -- markers, text, and the blank line above it -- which is the case for every project with no config, so the paragraph costs the default output nothing.
Its one home is the rule module `instructions/core/swe/swe-docs-layout.md`, and it is deliberately not quoted here: a second copy would be text shipping as instructions with no drift check on it.
Why conditional content is applied as a post-render rewrite rather than templated is in [`project-dependent-rule-content`](../design-decisions/project-dependent-rule-content.md).

## Adding a documentation folder

1. Add the folder to the map (`#swe-docs-layout`) -- its path, naming pattern, and one-line intent.
   Every shipped row has a path; the pathless `external` form is only ever a project's override, never a default.
2. Give the row a **stable owner tag**. The remap config keys on it, so a consumer's config names it; renaming or removing one is a breaking change for them.
3. **Classify the new tag in `ROW_POLICY`** (`src/docslayout.js`): whether it may be `external`, and which placeholder a relocated path must keep.
   `npm test` asserts every shipped row is classified, so a row added without this step fails the suite, and nothing else states how to satisfy it.
4. Put its lifecycle in an owner rule (new or existing), and record that ownership in `instructions/ownership.yaml`.
5. Cross-reference the two.

The live map is `#swe-docs-layout`; this document is the standard it conforms to.
Its counterpart is [`documentation-model.md`](./documentation-model.md), which says which record answers what.
