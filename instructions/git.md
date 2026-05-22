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

## #git-usage Usage reporting

- AI commits add a trailer after `Co-Authored-By:`: `Usage: model=<model-id>` (e.g. `claude-opus-4-7[1m]`).
  Multiple models: `model=opus-4.7; subagents=sonnet-4.6 x3`.
  The `Co-Authored-By:` line names the same (or dominant) model.
- AI PR bodies end with a `## Usage` section aggregating model(s), total tokens, and wall-clock time.
  Use only real numbers from tooling (`/cost`, `rtk gain`); omit a field rather than estimate it.
