# UI Guidelines

Concrete, implementable UI patterns. The principles behind them: `#front-nielsen-heuristics`, `#front-cdn`, `#front-display-labels`.

## #ui-header-visibility Breadcrumb and page title stay in the viewport

**Rule.** On every routed page, the breadcrumb trail and the page title MUST remain visible as the user scrolls.
Scrolling applies to the page *body* only, not the whole window.

**Why.** The breadcrumb and title are the user's sense of location.
Losing them on scroll breaks the mental map, especially on long lists and deep detail views.

## #ui-tabs Tab content is visibly distinct from the surrounding page

**Rule.** When a page contains a tab switcher, the region that updates on tab change MUST be visually distinct from the region that does not.
The user should be able to point at the tab-owned region without clicking.

**Why.** Tabs that visually blend into the page make switching tabs feel like nothing happened: the user doesn't know whether their click landed, and doesn't know which part of the screen just changed.

## #ui-canonical-states Canonical state primitives

Handle the 4 canonical state primitives in a consistent way:

1. Loading
2. Error
3. Information
4. Empty

Provide shared components for these states, with different representations:

1. Inline -- used along text, cells, lists, input fields, etc.
2. Panel -- used to fill the available space and display the message centered.
3. Card -- used to have a designated (wide) space displayed with other components.

The component may have the following features: `title` / `subtitle` / `actionLabel` / `onAction` / `actionIcon`.

## #ui-validation Validation errors stay close to their cause

**Rule.** Render validation errors next to the input that caused them.
Do not surface a top-of-form summary banner unless the error is genuinely cross-cutting (touches multiple fields and cannot be pinned to one).

**Why.** When a field is invalid, the user looks at the field, not the top of the form.
A banner that repeats per-field errors adds noise and trains users to ignore inline error text.
