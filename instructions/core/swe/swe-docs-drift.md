# #swe-docs-drift Documentation drift

Before opening or updating a PR, check for documentation drift -- any doc the change has made stale.
Fix it in the same PR, before opening or updating.
"The change" includes direct code edits, dependency version bumps that alter observable behavior or public surface, and configuration changes that affect documented behavior.
The repository's top-level `README` is always in scope -- check it every PR, not only when an identifier search happens to hit it; it is the most user-facing surface and drifts silently.
This includes, but is not limited to, the reference spec (#swe-reference-spec) and its entity model (#swe-entity), the design-decisions log (#swe-design-decisions), any `README` or `CONTRIBUTING` file at any level, files under `docs/`, inline documentation (JSDoc, docstrings, API annotations in code), and any other user-facing documentation surface outside those paths (e.g. `prompts/`, standalone usage guides).
Discover the affected docs, do not eyeball them: search the docs for the identifiers, flags, commands, and paths the change touched, and check each hit.
A doc *example* (snippet, CLI invocation, config block, request/response) is stale when it no longer runs or matches the current surface; update it in the same PR or delete it.
