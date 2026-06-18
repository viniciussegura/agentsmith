# #code-style Code style

- Default to editing existing files; create new ones only when the structural fit is clear.
- No gratuitous comments.
  Prefer named identifiers over explanatory prose.
- No magic literals: extract an unnamed numeric or string constant to a named constant at the narrowest scope that covers its uses. (Visual style values -- color, spacing, radius -- are governed by #ui-design-tokens, not here.)
- Defer to the project's configured formatter and linter; never hand-format against them, and never reformat untouched lines into the diff.
