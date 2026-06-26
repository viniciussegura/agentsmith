# #code-style Code style

- Default to editing existing files; create new ones only when the structural fit is clear.
- No gratuitous comments.
  Prefer named identifiers over explanatory prose.
- No magic literals: extract an unnamed numeric or string constant to a named constant at the narrowest scope that covers its uses. (Visual style values -- color, spacing, radius -- are governed by the *Design tokens* rule in the frontend bundle, not here; that rule is bundle-only by design, so this is a deliberate prose reference, not a cross-bundle tag link.)
- Defer to the project's configured formatter and linter; never hand-format against them, and never reformat untouched lines into the diff.
- A project instruction file may opt into a heavier comment style; where it does, defer to it (see preamble precedence).
