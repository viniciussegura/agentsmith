# #git-title Commit and PR title format

- Conventional Commits: `<type>(<scope>): <subject>`, where `<type>` is one of `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `style`, `perf`, `ci`, `build`.
- The full title (`<type>(<scope>): <subject>`) fits on one line of 72 characters or fewer; `<scope>` is optional (omit the parentheses when absent).
- `<subject>` is sentence case, past tense (what was done).
- A breaking change is flagged with `!` before the colon (`feat!: ...`) and carries a `BREAKING CHANGE:` footer in the body.
- Prefix AI-authored commits and PR titles with `🤖 ` -- a marker that keeps history honest about who wrote what. The agent knows it is AI-authored from its own run context, so it applies the prefix when creating the message; the marker is verification-surface only, never grounds for a retroactive amend or force-push.

| Author | Subject |
|---|---|
| AI | `🤖 feat(backend): Added cursor pagination to the list API` |
| Human | `docs: Split README into docs/getting-started.md` |
