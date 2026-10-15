# #code-style Code style

- Default to editing existing files; create new ones only when the structural fit is clear.
- No gratuitous comments: prefer named identifiers over explanatory prose.
  Two comments are the exception: a non-obvious constraint at the site it constrains (why a watcher API is avoided on one platform), and a pointer naming the slug of the design decision that governs the site (#swe-design-decisions), which is what makes the decision discoverable from the code it binds.
- A comment documents the code as it stands now, never the history that produced it -- not what the code used to do, which alternative was tried, or when it changed; that history is in git and in the PR body (#git-pr).
  The design-decision pointer names where the standing rationale lives rather than restating it.
  Comment prose follows #code-prose.
- No magic literals: extract an unnamed numeric or string constant to a named constant at the narrowest scope that covers its uses.
  Visual style values (color, spacing, radius) are governed by the frontend bundle's *Design tokens* rule, a deliberate prose reference to a bundle-only rule.
- Defer to the project's configured formatter and linter; never hand-format against them, and never reformat untouched lines into the diff.
- A project instruction file may opt into a heavier comment style; where it does, defer to it (preamble precedence).
