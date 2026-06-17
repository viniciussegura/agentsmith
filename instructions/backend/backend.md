# Back-end instructions

API-contract rules for services and their consumers.

## #be-api-first API first

The API is the contract between providers and consumers, so treat it with special care.
Design a consistent API following established best practices for its style (REST, GraphQL, gRPC); the entity-variation rules below hold whatever the style.

The same entity **MUST NOT** have multiple shapes across endpoints.
Keep entity variations to a small, fixed set:

1. `EntityRef`: when referenced by another entity and only a small set of fields is needed for display (_e.g._ `id` and `name` for the UI).
2. `EntityShort`: when returned in a list, to reduce JSON size.
3. `Entity`: when a single instance is requested; may return the complete available information.
4. `EntityPOST` / `EntityPATCH`: used only in those endpoints; may have optional fields.

When returning an instance, the data structure **MUST NOT** have optional fields.
A field may be nullable, but never optional.
This surfaces backend issues earlier: it is always clear when a value should have been returned.

**Identifiers** -- every entity's `id` is stable, opaque, and never reused after deletion; do not expose internal auto-increment integers as public ids. Changing the id strategy for a live entity is a breaking change (#be-api-versioning).

**Pagination** -- list endpoints that may return more than fits in one response **MUST** paginate, with one strategy applied uniformly across the service: cursor (`{ data: EntityShort[]; nextCursor: string | null }`) or offset (`{ data: EntityShort[]; total: number; page: number; pageSize: number }`). The envelope is part of the versioned contract (#be-api-versioning).

Worked example -- one entity through its variations, `Ref ⊂ Short ⊂ Entity`:

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
| `GET /users` | -- | `UserShort[]` |
| `GET /users/:id` | -- | `User` |
| `POST /users` | `UserPOST` | `User` |
| `PATCH /users/:id` | `UserPATCH` | `User` |
| `GET /tasks/:id` | -- | `Task` (embeds `assignee: UserRef`) |

- `EntityRef` has no endpoint of its own -- it only fills a nested slot.
- Lists return `EntityShort`, single fetches return the full `Entity`; the same entity never changes shape at one call type.
- Write endpoints accept `POST` / `PATCH` bodies and return the full `Entity`, so the client gets server-set fields (`id`, `createdAt`) back.

## #be-api-versioning API versioning and deprecation

Version the API contract; a **breaking change** ships under a new version, never by mutating the released shape.
An unreleased shape may change freely; the versioning obligation attaches only once a shape has shipped to a consumer. A version increment is a release-time decision (#swe-done / #git-pr-body), never per-commit during development.
A breaking change is any of: removing or renaming a field or endpoint; narrowing a field's type; making a previously-nullable field non-nullable; changing the semantics of an existing field.
Additive changes (new optional request fields, new nullable response fields) are non-breaking and **MUST NOT** increment the version.
Signal the version by one convention per service, applied uniformly -- a URL path segment (`/v2/`) for REST, a new named type for GraphQL, a metadata field for gRPC.
Mark a superseded field or endpoint deprecated before removal, with a documented migration path; deprecated surface stays functional for at least one full release cycle.
Entity variations (#be-api-first) stay stable within a version.

## #be-schema-migration Schema migration safety

Every migration **MUST** be backward-compatible with the currently-deployed app (expand-contract).
Safe in any migration: add a nullable column with a default; add a table or index; widen a type.
Unsafe -- require expand-then-contract over two releases: make a column non-nullable; rename/remove a column or table; narrow a type; change a primary-key strategy.
A migration that destroys or overwrites data **MUST** be called out in the PR body (#git-pr-body) with the rows/columns affected and why the loss is acceptable; otherwise add a backfill first.
Migrations are append-only: never edit an applied migration -- correct it with a new forward migration (#swe-dead-code, #git-branch-workflow). Record accepted risk as #swe-technical-debts.
