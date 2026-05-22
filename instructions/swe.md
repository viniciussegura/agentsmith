# Software engineering

## #swe-environment Environment and secrets

- Env vars are documented in `.env.example` (committed); `.env` is gitignored and loaded automatically by the code.
- **Never** commit real secrets.
- Personal email addresses must **never** appear in committed files.
  When a file needs an author or committer email, use the value from `git config user.email`.
  Do not substitute a personal email seen in conversation context, memory, or chat history.
  When unsure, run `git config user.email` and use that.

## #swe-reuse Reuse before creation

Before creating a component, search the codebase for one with the same name or purpose.
Two components with the same name in different directories is a bug.
Serve one concept from a single shared implementation across pages or endpoints rather than duplicating it.

## #swe-future-work Future work

Deferred or out-of-scope work goes in `docs/future-work/<YYYY-MM-DD>-<slug>.md`, stating what it is, why it matters, and any constraints or dependencies.
Record it when the decision to defer is made, not later.

## #swe-technical-debts Technical debt

Each accepted shortcut or known limitation goes in `docs/technical-debts/<YYYY-MM-DD>-<slug>.md`, stating the debt, why it was accepted, its cost or risk, and a remediation sketch.
Record it the moment it is incurred.

## #swe-entity Entity model upkeep

Core entities handled by the solution (sometimes called core concepts or core abstractions) should be documented in `docs/entity-model.md`.
This file presents a human-readable description of the current model, expressed as pure TypeScript types and interfaces.
The description reflects how users should understand the model.
It is **NOT** documentation of how the model is implemented (_e.g._ not a database schema).
Every change to the entity schema **MUST** be accompanied by an updated entity model.

## #swe-api-first API first

The API is the contract between providers and consumers, so treat it with special care.
Design a consistent API following REST API best practices.

The same entity must **not** have multiple shapes across endpoints.
Keep entity variations to a small, fixed set:

1. `EntityRef`: when referenced by another entity and only a small set of fields is needed for display (_e.g._ `id` and `name` for the UI).
2. `EntityShort`: when returned in a list, to reduce JSON size.
3. `Entity`: when a single instance is requested; may return the complete available information.
4. `EntityPOST` / `EntityPATCH`: used only in those endpoints; may have optional fields.

When returning an instance, the data structure must **not** have optional fields.
A field may be nullable, but never optional.
This surfaces backend issues earlier: it is always clear when a value should have been returned.
