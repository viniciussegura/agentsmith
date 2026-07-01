# Documentation layout

How agentsmith organizes its own `docs/` tree, and the standard every documentation folder follows.
A member of the reference spec (`#swe-reference-spec`): it reflects the convention as it is **now** and carries no `Status:` line.

## The separation of concerns

A documentation folder has two facets, kept in two homes:

- **Location and intent** -- the path, the naming pattern, and a one-line statement of what the folder holds. 
  These live once, in the layout map (`#swe-docs-layout`), the single source of truth for every `docs/` path and naming pattern.
- **Lifecycle** -- when a file is created, what it must state, when it is deleted, who consults it. 
  This lives in the folder's owner rule (e.g. `#swe-technical-debts`, `#ai-plan`), which cites the map for location and **never** restates the path pattern.

The two cross-reference: the map points at each owner rule for behavior, the owner rule points at the map for location.

## Why

A folder's path and naming pattern have exactly one home, so renaming or relocating a folder is a one-place edit and cannot drift between rules. 
The deliberate cost is cohesion: learning both *where* a folder is and *how* it behaves now spans two rules (a tension with `#swe-deep-modules`), accepted because path drift is the more damaging failure.

## Adding a documentation folder

1. Add the folder to the map (`#swe-docs-layout`) -- its path, naming pattern, and one-line intent.
2. Put its lifecycle in an owner rule (new or existing), and record that ownership in `instructions/ownership.yaml`.
3. Cross-reference the two.

The live map is `#swe-docs-layout`; this document is the standard it conforms to.
