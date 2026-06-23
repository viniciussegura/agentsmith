# #git-merge-conflict Merge-conflict resolution

- **Never** push a tree containing conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`).
- An AI agent **MUST NOT** auto-resolve a merge conflict -- stop, surface the conflicting hunks, and ask the user to decide, giving a recommendation.
- After the user resolves, the agent may stage the resolved files and continue.
- Prefer rebasing a local (unpushed) branch over a merge commit; once pushed, resolve via a merge commit, never a rebase (#git-branch-workflow).
