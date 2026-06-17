# Code standards

## #code-markdown Markdown formatting

- One sentence per line; hard-wrap only at sentence boundaries, never by column count.
- Leave lists, tables, fenced code blocks, frontmatter, and inline HTML untouched.
- When editing a `.md`, apply this to any paragraph you touch.
- Diff-friendliness only -- rendered output is unchanged.
- Prefer `--` to em-dash.

## #code-style Code style

- Default to editing existing files; create new ones only when the structural fit is clear.
- No gratuitous comments.
  Prefer named identifiers over explanatory prose.
- No magic literals: extract an unnamed numeric or string constant to a named constant at the narrowest scope that covers its uses. (Visual style values -- color, spacing, radius -- are governed by #ui-design-tokens, not here.)
- Defer to the project's configured formatter and linter; never hand-format against them, and never reformat untouched lines into the diff.
