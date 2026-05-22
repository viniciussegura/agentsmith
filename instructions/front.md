# Front-end instructions

- Frontend changes that render UI must follow design guidelines.

## #front-display-labels Display labels

Wherever an entity instance is represented in the UI the visible text resolves to that entity's natural name.
Static type labels and internal IDs are not acceptable substitutes.
While the name is loading, render a skeleton placeholder or an em-dash — never a fallback string of the entity type.
Type labels remain appropriate as *qualifiers* (e.g. a `PageTitle`'s entity-type prefix above the name, or a column header "Task"); the rule covers slots where the *instance* is what should appear.
