# #code-style Code style

- Default to editing existing files; create new ones only when the structural fit is clear.
- No gratuitous comments.
  Prefer named identifiers over explanatory prose.
  Two comments are **not** gratuitous and are the exception this rule carves out: a non-obvious constraint at the site it constrains (_e.g._ why a watcher API is avoided on one platform), and a pointer naming the slug of the design decision that governs the site (#swe-design-decisions).
  Both carry information no identifier can, and the second is what makes a decision discoverable from the code it binds.
- No magic literals: extract an unnamed numeric or string constant to a named constant at the narrowest scope that covers its uses. (Visual style values -- color, spacing, radius -- are governed by the _Design tokens_ rule in the frontend bundle, not here; that rule is bundle-only by design, so this is a deliberate prose reference, not a cross-bundle tag link.)
- Defer to the project's configured formatter and linter; never hand-format against them, and never reformat untouched lines into the diff.
- A project instruction file may opt into a heavier comment style; where it does, defer to it (see preamble precedence).
