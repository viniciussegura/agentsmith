# Git

## #git-title Commit and PR title format

- Conventional Commits: `<type>(<scope>): <subject>`, where `<type>` is one of `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `style`, `perf`, `ci`, `build`.
- `<subject>` is sentence case, past tense (what was done).
- Prefix AI-authored commits and PR titles with `🤖 ` -- a marker that keeps history honest about who wrote what.

| Author | Subject |
|---|---|
| AI | `🤖 feat(backend): Added cursor pagination to the list API` |
| Human | `docs: Split README into docs/getting-started.md` |

## #git-pr-body PR description

A PR body states what changed and why, links any spec or plan (#ai-plan) and related issues, and lists how the change was verified.
AI-authored PRs note the model(s) used (#git-usage).
Call out anything reviewers should scrutinize, and any follow-up deferred to #swe-future-work.

## #git-usage Authorship reporting

- AI commits add a trailer after `Co-Authored-By:`: `Usage: model=<model-id>` (e.g. `claude-opus-4-7[1m]`).
  Multiple models: `model=opus-4.7; subagents=sonnet-4.6 x3`.
  The `Co-Authored-By:` line names the same (or dominant) model.
- AI PR bodies note the model(s) used.
- No token or time figures in git -- they cannot be reliably sourced and go stale.
  Track spend in tooling (`/cost`, `rtk gain`) instead.

## #git-branch-workflow Branch workflow

We follow the [Git feature branch workflow](https://www.atlassian.com/git/tutorials/comparing-workflows/feature-branch-workflow), with one adjustment: a branch maps to a **logical unit of work**, not strictly a single feature.

- All work happens on branches off `main`.
  Changes land on `main` via squash-merge.
- A branch's scope is its logical unit, which may be wider than one feature.
  Implementing a feature often surfaces related issues; fixing them on the same branch is expected.
  A branch may also bundle deliberately, _e.g._ a "release revision" collecting several fixes.
  Layered work on one branch is fine -- it squashes into a single commit by design.
- **One session, one branch.**
  Within a conversation / session, all work continues on the branch the session is operating on.
  An AI assistant must **not** create or switch to a new branch mid-session unless the user explicitly approves it.
- A branch name should reflect its unit of work.
  When the tooling allows it, the session name should match the branch.
- Commit and push granularity is free -- as many as the logical units demand.
  Pre-merge granularity is free; squash collapses it at merge.
- **Never** rewrite published history.
  Once pushed (any branch, including feature branches) a commit is append-only: no `git push --force`, no `--force-with-lease`, no rebase or reset of pushed commits.
  Local-only commits may be amended or reordered until the next push.
