# #be-api-versioning API versioning and deprecation

Version the API contract; a **breaking change** ships under a new version, never by mutating the released shape.
An unreleased shape may change freely; the versioning obligation attaches only once a shape has shipped to a consumer. A version increment is a release-time decision (#swe-done / #git-pr-body), never per-commit during development.
A breaking change is any of: removing or renaming a field or endpoint; narrowing a field's type; making a previously-nullable field non-nullable; changing the semantics of an existing field; renaming or restructuring the pagination envelope fields (`nextCursor`, `total`, `page`, `pageSize`).
Additive changes (new optional request fields, new nullable response fields) are non-breaking and **MUST NOT** increment the version.
Signal the version by one convention per service, applied uniformly -- a URL path segment (`/v2/`) for REST, a new named type for GraphQL, a metadata field for gRPC.
Mark a superseded field or endpoint deprecated before removal, with a documented migration path; deprecated surface stays functional for at least one full release cycle.
Entity variations (#be-api-first) stay stable within a version.
