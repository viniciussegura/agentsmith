# #swe-docs-drift Documentation drift

Before opening or updating a PR, check for documentation drift -- any doc the change has made stale -- and fix it in the same PR.
"The change" includes direct code edits, dependency bumps that alter observable behavior or public surface, and configuration changes that affect documented behavior.
The repository's top-level `README` is always in scope: check it every PR, not only when an identifier search happens to hit it.
Also in scope: the reference spec (#swe-reference-spec) and its entity model (#swe-entity), the design-decisions log (#swe-design-decisions), any `README` or `CONTRIBUTING` file at any level, files under `docs/`, inline documentation (JSDoc, docstrings, API annotations), and any other user-facing surface (`prompts/`, standalone guides).
Changes to config files are in scope for `CONTRIBUTING` drift.
Discover the affected docs, do not eyeball them: search the docs for the identifiers, flags, commands, and paths the change touched, and check each hit.
A doc *example* (snippet, CLI invocation, config block, request/response) is stale when it no longer runs or matches the current surface; update it in the same PR or delete it.
Prose written or rewritten to resolve drift follows #code-prose.
The done gate (#swe-done, item 3) restates this obligation per unit of work, so drift is resolved per unit rather than only at the PR.
