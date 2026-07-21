# #git-title Commit and PR title format

- Conventional Commits: `<type>(<scope>): <subject>`, where `<type>` is one of `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `style`, `perf`, `ci`, `build`, `revert`.
- The full title (`<type>(<scope>): <subject>`) fits on one line of 72 characters or fewer; `<scope>` is optional (omit the parentheses when absent).
- `<subject>` is sentence case, imperative mood (what the commit does, not what was done): e.g. "Add cursor pagination", not "Added cursor pagination".
- A `revert` title names the reverted commit: `revert(scope): Revert "feat: Add X"` or `revert: Revert commit abc1234`.
- A breaking change is flagged with `!` before the colon (`feat!: ...`) and carries a `BREAKING CHANGE:` footer in the body.
