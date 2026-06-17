# Front-end instructions

Abstract front-end and HCI principles.
Concrete, implementable patterns live in the `#ui-*` rules.

## #front-display-labels Display labels

Wherever an entity instance is represented in the UI the visible text resolves to that entity's natural name.
**Never** use static type labels or internal IDs as substitutes.
While the name is loading, render a skeleton placeholder or an em-dash glyph (`—`), never a fallback string of the entity type.
Type labels remain appropriate as *qualifiers* (e.g. a `PageTitle`'s entity-type prefix above the name, or a column header "Task"); the rule covers slots where the *instance* is what should appear.

## #front-nielsen-heuristics Usability Heuristics

Follow established usability heuristics in UI design, for example [Nielsen's 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/).
Design alternatives often present a trade-off between heuristics; point out the trade-off when it arises.

## #front-cdn Cognitive dimensions of notations

Use [Cognitive dimensions of notations](https://en.wikipedia.org/wiki/Cognitive_dimensions_of_notations) as a second lens alongside #front-nielsen-heuristics when weighing design alternatives.
Dimensions trade off against each other, and each carries a sign -- some are bad when present (error-proneness), others good (consistency) -- so judge the direction, not just the presence.

## #front-a11y Accessibility

Target WCAG 2.1 AA.
Every interactive element is keyboard-reachable and operable; visible focus is never suppressed.
Use semantic HTML first; reach for ARIA only to fill gaps, never to override native semantics.
Every input has a programmatic label; every meaningful image has alt text; decorative images are marked empty.
Meet contrast ratios: 4.5:1 for body text, 3:1 for large text and UI affordances.
**Never** convey state by color alone -- pair it with text or an icon.
Content that updates asynchronously (search results, notifications, status) **MUST** announce via an appropriate live region (`aria-live`, `role="status"`, `role="alert"`) at a politeness matching urgency.
Animation and transitions **MUST** respect `prefers-reduced-motion: reduce` with a no-motion fallback.
