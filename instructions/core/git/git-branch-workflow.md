# #git-branch-workflow Branch workflow

The [Git feature branch workflow](https://www.atlassian.com/git/tutorials/comparing-workflows/feature-branch-workflow), with one adjustment: a branch carries a coherent **deliverable**, not strictly a single feature.

- All work happens on branches off the default branch.
  A new deliverable branches from an up-to-date default branch (fetch first), never from the session's current branch; on another branch, confirm the base with the user first.
  **Never** commit directly to the default branch; when a commit is warranted there, stop and ask to create a branch first.
- A branch's scope is its deliverable: related issues are fixed on it, and layered work squashes into one commit.
  The branch ships once it stops converging (`#swe-branch-lifespan`, in the process bundle, decides *when*).
- The **squash-merge is performed by the human**, not the AI agent.
  Its subject follows #git-title, its body links the PR (#git-pr), and the human copies the authorship trailers onto it (#git-usage).
  Delete the source branch after the squash-merge.
- **One session, one branch.**
  An AI agent **MUST NOT** create or switch to a new branch mid-session unless the user explicitly approves it.
- A branch name is its deliverable in `kebab-case`, at most ~60 characters, preferably prefixed with its Conventional-Commit type (`feat/`, `fix/`, `docs/`, `chore/`, `refactor/`); the session name matches it.
- Commit and push granularity is free.
- **Never** rewrite published history: once pushed, any commit is append-only -- no `git push --force`, no `--force-with-lease`, no rebase or reset of pushed commits.
  Local-only commits may be amended or reordered until the next push.
