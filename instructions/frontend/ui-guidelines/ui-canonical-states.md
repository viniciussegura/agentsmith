# #ui-canonical-states Canonical state primitives

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
