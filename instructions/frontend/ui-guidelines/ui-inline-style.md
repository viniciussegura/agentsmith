# #ui-inline-style No inline style where a class belongs

Style elements through shared classes or token-backed CSS custom properties, not inline `style` attributes (#ui-design-tokens).
An inline style is a last resort for a genuinely dynamic value that cannot be expressed as a class or variable (e.g. a computed pixel offset); document why with a comment.
A static value applied inline -- even a correct design-token value -- bypasses theming, dark mode, and design-system overrides, and is a defect.
