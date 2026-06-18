# #swe-docs-drift Documentation drift

Before opening or updating a PR, check for documentation drift -- any doc the change has made stale.
Fix it in the same PR, before opening or updating.
This includes, but is not limited to, the reference spec (#swe-reference-spec) and its entity model (#swe-entity), any `README` or `CONTRIBUTING` file at any level, files under `docs/`, and any other user-facing documentation surface outside those paths (e.g. `prompts/`, standalone usage guides).
Discover the affected docs, do not eyeball them: search the docs for the identifiers, flags, commands, and paths the change touched, and check each hit.
A doc *example* (snippet, CLI invocation, config block, request/response) is stale when it no longer runs or matches the current surface; update it in the same PR or delete it.
