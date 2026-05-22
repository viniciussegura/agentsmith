# Git instructions

## #git-workflow Git workflow

- Commit and push granularity is free.
  Make as many commits and pushes as logical units demand.
- **Never rewrite published history.**
  Once a commit is pushed to a remote branch — including feature branches — it is append-only.
  No `git push --force`, no `git push --force-with-lease`, no `git rebase` of pushed commits, no `git reset` of the remote tip.
  Local-only commits may be reordered or amended freely until the next push.

## #git-format Commit and PR title format

- Follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification:
  - `<type>(<scope>): <subject>` where `<type>` is one of `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `style`, `perf`, `ci`, `build`.
  - The `<subject>` should follow sentence case, describing what was done in the commit (_i.e._ using past tense).
- Prefix AI-authored commits and PR titles with `🤖 `.
  The prefix is a marker for automated contributions so git history stays honest about who wrote what.

Examples:

| Author | Commit subject |
|---|---|
| AI  | `🤖 feat(backend): Worked on API` |
| AI  | `🤖 docs: Split README into docs/getting-started.md` |
| Human | `feat(backend): Worked on API` |
| Human | `docs: Split README into docs/getting-started.md` |

## #git-usage Usage reporting

Every AI-authored commit ends with a `Usage:` trailer placed after the `Co-Authored-By:` line:

```markdown
Usage: model=<model-id> tokens=~<count> duration=<wall-clock>
```

- `<model-id>` is the model that actually authored the work (e.g. `claude-opus-4-7[1m]`, `claude-sonnet-4-6`, `claude-haiku-4-5`).
  When multiple models contributed, list each: `model=opus-4.7; subagents=sonnet-4.6 x3`.
  The commit's `Co-Authored-By:` line must name the same model (or the dominant one).
- `<count>` is total tokens used for the work in this commit.
  Readable shorthand is fine (`~20k`, `~1.2M`) or a plain integer (`~20000`).
  A leading `~` marks the estimate as approximate.
- `<wall-clock>` is an informal duration like `30s`, `2m`, `2m 30s`, `1h 15m`, or `~2m` if approximate.
  Omit units that are zero.

Every AI-authored PR body ends with a `## Usage` section that aggregates across all commits and subagent dispatches in the PR:

```markdown
## Usage
- Model(s): claude-opus-4-7[1m] (main), claude-sonnet-4-6 (subagents × N)
- Total tokens: ~X,XXX,XXX across N dispatches
- Wall-clock time: Hh Mm
```
