# #git-sync-policy Keeping a feature branch current

While a feature branch is in progress, keep it current with the default branch rather than letting it drift far behind.
- Integrate the default branch on a cadence -- at least before opening a PR and before final review -- so conflicts surface early and small.
- Prefer **rebase** onto the updated default branch while the branch's history is still local and unshared: it keeps a linear, readable history.
- Once the branch is shared (pushed, and others may have based work on it), prefer **merge** from the default branch: **never** rewrite already-published history (#git-branch-workflow).
- Resolve conflicts as part of the sync, never by discarding the default branch's changes to make your own apply cleanly.
