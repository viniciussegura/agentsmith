# #git-branch-workflow Branch workflow

We follow the [Git feature branch workflow](https://www.atlassian.com/git/tutorials/comparing-workflows/feature-branch-workflow), with one adjustment: a branch maps to a **logical unit of work**, not strictly a single feature.

- All work happens on branches off `main`.
  A new unit of work branches from an up-to-date `main` (fetch first), not from whatever branch the session is currently on -- a prior session branch may be stale or already squash-merged.
  When new work starts while the session is on a non-`main` branch, confirm the intended base with the user before branching.
  Changes land on `main` via squash-merge.
  **Never** commit directly to `main` or the default branch; when a commit is warranted there, stop and ask to create a branch first.
- A branch's scope is its logical unit, which may be wider than one feature.
  Implementing a feature often surfaces related issues; fixing them on the same branch is expected.
  A branch may also bundle deliberately, _e.g._ a "release revision" collecting several fixes.
  Layered work on one branch is fine -- it squashes into a single commit by design.
- The **squash-merge is performed by the human**, not the AI assistant -- via the host's merge button or `git merge --squash`.
  The squash-commit subject follows #git-title (it is the only commit that survives on `main`); its body summarizes the change and links the PR (#git-pr-body).
  Delete the source branch after a successful squash-merge.
- **One session, one branch.**
  Within a conversation / session, all work continues on the branch the session is operating on.
  An AI assistant **MUST NOT** create or switch to a new branch mid-session unless the user explicitly approves it.
- A branch name reflects its unit of work and uses `kebab-case` -- lowercase letters, digits, hyphens; no spaces, underscores, or uppercase -- at most ~60 characters.
  A `<type>/` prefix matching the Conventional-Commit type (`feat/`, `fix/`, `docs/`, `chore/`, `refactor/`) is preferred.
  When the tooling allows it, the session name matches the branch.
- Commit and push granularity is free -- as many as the logical units demand.
  Pre-merge granularity is free; squash collapses it at merge.
- **Never** rewrite published history.
  Once pushed (any branch, including feature branches) a commit is append-only: no `git push --force`, no `--force-with-lease`, no rebase or reset of pushed commits.
  Local-only commits may be amended or reordered until the next push.
