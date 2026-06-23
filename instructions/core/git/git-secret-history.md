# #git-secret-history Committed-secret response

If a secret (credential, token, key) is found in published history:

1. Revoke and rotate the secret at the issuing service first -- before any git operation.
2. Open a branch and notify the human owner; do **not** force-push or rewrite history without explicit user authorization.
3. On authorization, the history rewrite is the **one** permitted exception to the no-force-push rule (#git-branch-workflow): use `git filter-repo` (not `filter-branch`) to excise the secret, then force-push only the affected branch under user supervision.
4. Treat every clone as contaminated; coordinate a re-clone or reset.

A history rewrite for any other reason remains prohibited (#git-branch-workflow). 
Committing the secret in the first place violates #swe-environment.
