# Git

## #git-branch-workflow Branch workflow

We follow the [Git feature branch workflow](https://www.atlassian.com/git/tutorials/comparing-workflows/feature-branch-workflow), with one adjustment: a branch maps to a **logical unit of work**, not strictly a single feature.

- All work happens on branches off `main`.
  Changes land on `main` via squash-merge.
  **Never** commit directly to `main` or the default branch; when a commit is warranted there, stop and ask to create a branch first.
- A branch's scope is its logical unit, which may be wider than one feature.
  Implementing a feature often surfaces related issues; fixing them on the same branch is expected.
  A branch may also bundle deliberately, _e.g._ a "release revision" collecting several fixes.
  Layered work on one branch is fine -- it squashes into a single commit by design.
- **One session, one branch.**
  Within a conversation / session, all work continues on the branch the session is operating on.
  An AI assistant **MUST NOT** create or switch to a new branch mid-session unless the user explicitly approves it.
- A branch name should reflect its unit of work.
  When the tooling allows it, the session name should match the branch.
- Commit and push granularity is free -- as many as the logical units demand.
  Pre-merge granularity is free; squash collapses it at merge.
- **Never** rewrite published history.
  Once pushed (any branch, including feature branches) a commit is append-only: no `git push --force`, no `--force-with-lease`, no rebase or reset of pushed commits.
  Local-only commits may be amended or reordered until the next push.

## #git-merge-conflict Merge-conflict resolution

- **Never** push a tree containing conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`).
- An AI agent **MUST NOT** auto-resolve a merge conflict -- stop, surface the conflicting hunks, and ask the user to decide, giving a recommendation.
- After the user resolves, the agent may stage the resolved files and continue.
- Prefer rebasing a local (unpushed) branch over a merge commit; once pushed, resolve via a merge commit, never a rebase (#git-branch-workflow).

## #git-pr-body PR description

A PR body **MUST** contain at minimum:

1. **What changed** -- a concise summary of the diff's intent.
2. **Why** -- the motivation or issue it addresses; link the spec or plan (#ai-plan) and related issues.
3. **Verification** -- the concrete steps taken: the commands run and any test output, or, when untestable, the explicit statement per #swe-done item 1. Not a bare "it works".
4. **Model** (AI-authored PRs only) -- the model(s) used, per #git-usage.
5. **Reviewer notes** (optional) -- anything reviewers should scrutinize, and any follow-up deferred to #swe-future-work.

## #git-secret-history Committed-secret response

If a secret (credential, token, key) is found in published history:

1. Revoke and rotate the secret at the issuing service first -- before any git operation.
2. Open a branch and notify the human owner; do **not** force-push or rewrite history without explicit user authorization.
3. On authorization, the history rewrite is the **one** permitted exception to the no-force-push rule (#git-branch-workflow): use `git filter-repo` (not `filter-branch`) to excise the secret, then force-push only the affected branch under user supervision.
4. Treat every clone as contaminated; coordinate a re-clone or reset.

A history rewrite for any other reason remains prohibited (#git-branch-workflow). 
Committing the secret in the first place violates #swe-environment.

## #git-title Commit and PR title format

- Conventional Commits: `<type>(<scope>): <subject>`, where `<type>` is one of `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `style`, `perf`, `ci`, `build`.
- The full title (`<type>(<scope>): <subject>`) fits on one line of 72 characters or fewer; `<scope>` is optional (omit the parentheses when absent).
- `<subject>` is sentence case, past tense (what was done).
- A breaking change is flagged with `!` before the colon (`feat!: ...`) and carries a `BREAKING CHANGE:` footer in the body.
- Prefix AI-authored commits and PR titles with `🤖 ` -- a marker that keeps history honest about who wrote what.

| Author | Subject |
|---|---|
| AI | `🤖 feat(backend): Added cursor pagination to the list API` |
| Human | `docs: Split README into docs/getting-started.md` |

## #git-tooling Git invocation

- Run git non-interactively: always pass `-m <msg>` to `git commit`; never drop into an editor that blocks the session.
- **Never** run interactive git in an agent session (`git rebase -i`, `git add -p`, `git commit` with no message).
- Do not pass `--no-verify` to bypass hooks: that disables a safety check (#ai-tool-safety). 
  If a hook blocks a commit, surface the failure and ask.

## #git-usage Authorship reporting

- AI commits add a trailer after `Co-Authored-By:`: `Usage: model=<model-id>` (e.g. `claude-opus-4-7[1m]`).
  Multiple models: `model=claude-opus-4-7; subagents=claude-sonnet-4-6 x3`.
  The `Co-Authored-By:` line names the same (or dominant) model.
- AI PR bodies note the model(s) used.
- No token or time figures in git -- they cannot be reliably sourced and go stale.
  Track spend in tooling (`/cost`, `rtk gain`) instead.
