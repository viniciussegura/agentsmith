# Front-end instructions

## #front-display-labels Display labels

Wherever an entity instance is represented in the UI the visible text resolves to that entity's natural name.
Static type labels and internal IDs are **not** acceptable substitutes.
While the name is loading, render a skeleton placeholder or an em-dash — never a fallback string of the entity type.
Type labels remain appropriate as *qualifiers* (e.g. a `PageTitle`'s entity-type prefix above the name, or a column header "Task"); the rule covers slots where the *instance* is what should appear.

## #front-nielsen-heuristics Usability Heuristics

The UI design should follow established usability heuristics, for example [Nielsen's 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/).
Design alternatives often present a trade-off between heuristics; point out the trade-off when it arises.

## #front-cdn Cognitive dimensions of notations

In addition to #front-nielsen-heuristics, another vocabulary for analyzing design alternatives is [Cognitive dimensions of notations](https://en.wikipedia.org/wiki/Cognitive_dimensions_of_notations).

Similar to #front-nielsen-heuristics, when analyzing design alternatives, a trade-off between dimensions may ensue.
Moreover, pay attention that not all dimensions have positive meanings, *i.e.* the observance/non-observance of a dimension may be of a positive or negative nature.
For example, the observation of *error-proneness* is of negative nature, while the observation of *consistency* is of positive nature.

## #front-error Error messages

Make every error message as human-readable as possible.
Additional information for reporting should be available, but initially hidden under a "show more details" or "copy details to clipboard".
