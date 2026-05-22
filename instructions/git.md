# Git

## #git-workflow Workflow

- Commit and push granularity is free — as many as the logical units demand.
- Never rewrite published history.
  Once pushed (any branch, including feature branches) a commit is append-only: no `git push --force`, no `--force-with-lease`, no rebase or reset of pushed commits.
  Local-only commits may be amended or reordered until the next push.

## #git-format Commit and PR title format

- Conventional Commits: `<type>(<scope>): <subject>`, where `<type>` is one of `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `style`, `perf`, `ci`, `build`.
- `<subject>` is sentence case, past tense (what was done).
- Prefix AI-authored commits and PR titles with `🤖 ` — a marker that keeps history honest about who wrote what.

| Author | Subject |
|---|---|
| AI | `🤖 feat(backend): Added cursor pagination to the list API` |
| Human | `docs: Split README into docs/getting-started.md` |

## #git-usage Authorship reporting

- AI commits add a trailer after `Co-Authored-By:`: `Usage: model=<model-id>` (e.g. `claude-opus-4-7[1m]`).
  Multiple models: `model=opus-4.7; subagents=sonnet-4.6 x3`.
  The `Co-Authored-By:` line names the same (or dominant) model.
- AI PR bodies note the model(s) used.
- No token or time figures in git — they cannot be reliably sourced and go stale.
  Track spend in tooling (`/cost`, `rtk gain`) instead.

## #git-branch-workflow Feature branch workflow

We follow the [Git feature branch workflow](https://www.atlassian.com/git/tutorials/comparing-workflows/feature-branch-workflow).

- All work happens on feature branches.
  Changes land on `main` via squash-merges.
- **One session, one branch.**
  Within a conversation / session, all work continues on the branch the session is operating on.
  An AI assistant must not create or switch to a new branch mid-session unless the user explicitly approves the new branch.
  Layered, unrelated work on a single branch is fine.
  Whenever a new branch is created, the conversation/session name should reflect the new branch.