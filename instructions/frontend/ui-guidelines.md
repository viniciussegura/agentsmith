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
- `additionalInformation` (optional): detail revealed behind a "show more details" affordance.
- `errorObj` (errors only, required): copy-to-clipboard bundle of the raw error plus timestamp, URL, user, and call stack for the developer.

**MUST** use these shared components wherever a canonical state is displayed; never render a one-off inline spinner, empty placeholder, or error banner that duplicates their behavior (#swe-reuse).

Follow #swe-display-messages for what the visible text says.

## #ui-validation Validation errors stay close to their cause, appear at the right time

**Placement.** Render validation errors next to the input that caused them, using #ui-canonical-states if not handled by the input itself.
Do not surface a top-of-form summary banner unless the error is genuinely cross-cutting (touches multiple fields and cannot be pinned to one).

**Timing.** Validate on blur, not on keystroke; once a field is in error, re-validate on every keystroke so the error clears the moment it is fixed; always re-validate the whole form on submit.

**Why.** When a field is invalid, the user looks at the field, not the top of the form.
Validating too early (keystroke) trains users to ignore inline errors; too late (submit-only) hides problems until it is too late to course-correct.

## #ui-empty-state-guidance Empty states guide the user

Every empty state (#ui-canonical-states) **MUST** include:

1. A short reason the space is empty (first run vs. filtered result vs. no data yet).
2. A primary call-to-action out of the empty state, or -- when none is available -- what will populate the space.

**Never** render a bare "No results" without context and a way forward (#front-nielsen-heuristics, recognition over recall).

## #ui-design-tokens Design tokens over magic values

Use the project's shared design tokens (CSS custom properties, theme-scale values, or the framework equivalent) for every color, spacing, radius, shadow, and typography value.
**Never** hard-code a hex color, pixel constant, or magic value where a token exists.
Where no token exists, add one rather than inlining; an inline override is a last resort, documented with a comment.
This covers visual style values; general non-visual literals are #code-style.

## #ui-destructive-confirm Destructive actions need confirmation or undo

Any user-initiated irreversible or hard-to-reverse action (delete, archive, bulk-remove, reset, permanent publish) **MUST** offer one of:

1. A confirmation step that names what will be destroyed and requires an explicit positive gesture.
2. An undo affordance available long enough to notice (a snackbar/toast with Undo).

Prefer undo for low-stakes bulk actions; confirmation for single high-stakes ones.
**Never** make the destructive action the default button; label it with the action ("Delete"), not "OK"; make it vis.
This is the user-facing mirror of #ai-tool-safety (agent actions).
