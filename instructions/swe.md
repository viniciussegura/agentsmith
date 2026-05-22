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
This file should present a human-readable description of the current model in use by code, using TypeScript documentation.
This description should reflect how the model should be understood by users, it is **NOT** a documentation of how the model is implemented (_e.g._ not a database schema).
Every change to the entities schema **MUST** be accompanied by an updated entity model.

## #swe-api-first API first

Since API is the contract between providers and consumers, we should take it into special consideration.
We should design a consistent API, following the best practices for REST API design.

The same entity should **not** have multiple versions depending on the endpoint.
We should thrive to keep a small number of entity variation:

1. EntityRef: when it is referenced by another entity and we only need a small set of information for display (_e.g._ only `id` and `name`, to be displayed by the UI)
2. EntityShort: when a list of entities are provided, to reduce the JSON size.
3. Entity: when a single instance is requested, can return the complete available information.
4. EntityPOST / EntityPATCH: used specifically in these endpoints, may have optional fields.

Additionally, when returning an instance, the data structure should **not** have optional fields.
The field may be nullable, but never optional.
This aids in detecting backend issues earlier, so it always clear when an information should have been returned.