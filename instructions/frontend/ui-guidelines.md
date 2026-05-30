# UI Guidelines

Concrete, implementable UI patterns.
The principles behind them: `#front-nielsen-heuristics`, `#front-cdn`, `#front-display-labels`.

## #ui-header-visibility Breadcrumb and page title stay in the viewport

**Rule.** On every routed page, the breadcrumb trail and the page title **MUST** remain visible as the user scrolls.
Scrolling applies to the page *body* only, not the whole window.

**Why.** The breadcrumb and title are the user's sense of location.
Losing them on scroll breaks the mental map, especially on long lists and deep detail views.

## #ui-tabs Tab content is visibly distinct from the surrounding page

**Rule.** When a page contains a tab switcher, the region that updates on tab change **MUST** be visually distinct from the region that does not.
The user should be able to point at the tab-owned region without clicking.

**Why.** Tabs that visually blend into the page make switching tabs feel like nothing happened: the user doesn't know whether their click landed, and doesn't know which part of the screen just changed.

## #ui-canonical-states Canonical state primitives

Handle three canonical state primitives consistently:

1. Loading -- transient state
2. Success / Information / Warning / Error -- terminal state
3. Empty -- terminal state with no data

Provide shared components for these states with three representations:

1. Inline -- along text, cells, lists, or input fields.
2. Panel -- fills the available space with the message centered.
3. Card -- occupies a designated wide slot alongside other components.

Each component carries:

- `title`: short, focused message.
- `subtitle` (optional): brief additional context.
- `actions` (optional): the calls to action available given the state.
- `additionalInformation` (optional): detail revealed behind a "show more information" affordance.
- `errorObj` (errors only, required): copy-to-clipboard bundle of the raw error plus timestamp, URL, user, and call stack for the developer.

Follow #swe-display-messages for what the visible text says.

## #ui-validation Validation errors stay close to their cause

**Rule.** Render validation errors next to the input that caused them, using #ui-canonical-states if not handled by the input itself.
Do not surface a top-of-form summary banner unless the error is genuinely cross-cutting (touches multiple fields and cannot be pinned to one).

**Why.** When a field is invalid, the user looks at the field, not the top of the form.
A banner that repeats per-field errors adds noise and trains users to ignore inline error text.
