# Software engineering

## #swe-agile Agile software development

Follow [Agile software development](https://en.wikipedia.org/wiki/Agile_software_development), especially these principles:

- **Early and continuous delivery of valuable software + Deliver working software frequently + Working software is the primary measure of progress**
  Find the MVP — the minimum viable product that delivers the most value.
  Iterate fast and test solutions quickly.
- **Welcome changing requirements, even in late development**
  Few things are set in stone; revisit assumptions at any time.
- **Close, daily cooperation between business people and developers**
  Software is ultimately done for people and by people.
  Pay attention to stakeholders and users; keep aligned with the work done by developers.
- **Continuous attention to technical excellence and good design + Simplicity—the art of maximizing the amount of work not done—is essential**
  Code standards and architecture should only be as complicated as needed, not more.
- **Reflection on how to become more effective, and adjust accordingly**
  If an idea of how to become more effective arises, it should be shared and considered for implementation.

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

Worked example — one entity through its variations, `Ref ⊂ Short ⊂ Entity`:

```typescript
interface UserRef {
  id: string;
  name: string;
}

interface UserShort {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null; // nullable on responses, never optional
}

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
}

interface UserPOST {
  name: string;
  email: string;
  bio?: string; // optional allowed on request bodies only
}

// UserRef appears INSIDE another entity, never fetched on its own:
interface Task {
  id: string;
  title: string;
  assignee: UserRef;
}
```

Each variation maps to a call site:

| Endpoint | Request body | Response |
|---|---|---|
| `GET /users` | — | `UserShort[]` |
| `GET /users/:id` | — | `User` |
| `POST /users` | `UserPOST` | `User` |
| `PATCH /users/:id` | `UserPATCH` | `User` |
| `GET /tasks/:id` | — | `Task` (embeds `assignee: UserRef`) |

- `EntityRef` has no endpoint of its own — it only fills a nested slot.
- Lists return `EntityShort`, single fetches return the full `Entity`; the same entity never changes shape at one call type.
- Write endpoints accept `POST` / `PATCH` bodies and return the full `Entity`, so the client gets server-set fields (`id`, `createdAt`) back.

## #swe-docs-drift Documentation drift

Before opening or updating a PR, check for documentation drift — any doc the change has made stale.
Fix it in the same PR, before opening or updating.
This includes — but is not limited to — the entity model (#swe-entity), any `README` or `CONTRIBUTING` file at any level, and files under `docs/`.
