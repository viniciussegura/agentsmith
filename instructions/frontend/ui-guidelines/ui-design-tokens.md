# #ui-design-tokens Design tokens over magic values

Use the project's shared design tokens (CSS custom properties, theme-scale values, or the framework equivalent) for every color, spacing, radius, shadow, and typography value.
**Never** hard-code a hex color, pixel constant, or magic value where a token exists.
Where no token exists, add one rather than inlining; an inline override is a last resort, documented with a comment.
This covers visual style values; general non-visual literals are #code-style.
