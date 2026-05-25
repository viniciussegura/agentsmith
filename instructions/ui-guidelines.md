# UI Guidelines

Concrete, implementable UI patterns.
The principles behind them: `#front-nielsen-heuristics`, `#front-cdn`, `#front-display-labels`.

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

Handle the 3 canonical state primitives in a consistent way:

1. Loading -- transient state
2. Success/Information/Warning/Error -- terminal state
3. Empty -- terminal state with no data

Provide shared components for these states, with different representations:

1. Inline -- used along text, cells, lists, input fields, etc.
2. Panel -- used to fill the available space and display the message centered.
3. Card -- used to have a designated (wide) space displayed with other components.

The component may have the following features:

- `title`: highlight text to be displayed, should be short and straight-to-the-point
- `subtitle`: (optional) additional text to be displayed, can provide more information about what happened.
  May be a little longer, but not with all details
- `actions`: (optional) calls to the available actions given the message.
  For each action, it should be provided:
  - `label`: text to be displayed.
  - `callback`: callback to be called when action is triggered.
  - `icon`: (optional) icon to be displayed next to the action
  - `type`: (optional) type of action, mapped to the button types available in the UI system (_e.g._ primary, secondary, ghost).
- `additionalInformation`: (optional) information to be displayed under a "show more information" button, usually expanding the component to show it.
- `errorObj`: (only for error type, mandatory) additional error object to be copied to clipboard providing additional details about the error to the **developer**.
  Should contain both the "raw" error, but also additional information such as timestamp, url that triggered the error, user, additional context, call stack, etc.

These canonical states should follow #front-display-messages instructions.

## #ui-validation Validation errors stay close to their cause

**Rule.** Render validation errors next to the input that caused them, using #ui-canonical-states if not handled by the input itself.
Do not surface a top-of-form summary banner unless the error is genuinely cross-cutting (touches multiple fields and cannot be pinned to one).

**Why.** When a field is invalid, the user looks at the field, not the top of the form.
A banner that repeats per-field errors adds noise and trains users to ignore inline error text.
