# #swe-environment Environment and secrets

- Env vars are documented in `.env.example` (committed); `.env` is gitignored and loaded automatically by the code.
- **Never** commit real secrets.
- Personal email addresses **MUST NOT** appear in committed files.
  When a file needs an author or committer email, use the value from `git config user.email`.
  Do not substitute a personal email seen in conversation context, memory, or chat history.
  When unsure, run `git config user.email` and use that.
