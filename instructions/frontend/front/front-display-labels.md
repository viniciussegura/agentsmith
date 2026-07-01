# #front-display-labels Display labels

Wherever an entity instance is represented in the UI the visible text resolves to that entity's natural name.
**Never** use static type labels or internal IDs as substitutes.
While the name is loading, render a skeleton placeholder or an em-dash glyph (`—`), never a fallback string of the entity type.
When a resolved name is longer than its slot, truncate visually (e.g. an ellipsis) while keeping the full value available through a tooltip or accessible label; **never** truncate so that which instance it is becomes ambiguous.
Type labels remain appropriate as *qualifiers* (e.g. a `PageTitle`'s entity-type prefix above the name, or a column header "Task"); the rule covers slots where the *instance* is what should appear.
