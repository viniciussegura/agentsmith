# #front-a11y Accessibility

Target WCAG 2.1 AA.
Every interactive element is keyboard-reachable and operable; visible focus is never suppressed.
Use semantic HTML first; reach for ARIA only to fill gaps, never to override native semantics.
Every input has a programmatic label; every meaningful image has alt text; decorative images are marked empty.
Meet contrast ratios: 4.5:1 for body text, 3:1 for large text and UI affordances.
**Never** convey state by color alone -- pair it with text or an icon.
Content that updates asynchronously (search results, notifications, status) **MUST** announce via an appropriate live region (`aria-live`, `role="status"`, `role="alert"`) at a politeness matching urgency.
Animation and transitions **MUST** respect `prefers-reduced-motion: reduce` with a no-motion fallback.
