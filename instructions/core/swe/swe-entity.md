# #swe-entity Entity model upkeep

Core entities (_aka_ core concepts or core abstractions) are documented in the entity model, `docs/reference-spec/entity-model.md` -- the canonical member of the reference spec (#swe-reference-spec) -- and follow rule #swe-terminology.
This file presents a human-readable description of the current model, expressed as pure TypeScript types and interfaces.
The description reflects how users should understand the model.
It is **NOT** documentation of how the model is implemented (_e.g._ not a database schema).
Every entity in the model declares, via JSDoc tags on its TypeScript type: its **stable identity** (`@identity`), the **cardinality** of each relationship to another entity (`@cardinality 1:1 | 1:N | M:N`), and any **uniqueness** constraint beyond identity (`@unique`).
Every change to the entity schema **MUST** be accompanied by an updated entity model; so **MUST** every change to how an entity behaves, is persisted, or is used, even when no TypeScript field changes -- the prose describing that behavior is updated too.
