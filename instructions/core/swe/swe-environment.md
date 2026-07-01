# #swe-environment Environment and secrets

- Required environment variables are documented in a committed, discoverable manifest (for example an example env file, a config schema, or the project README); the file holding real values is gitignored and loaded by the code, never committed.
- **Never** commit real secrets.
  Where CI is available, add a secret-scanning step (e.g. `gitleaks`, `trufflehog`, or the host's native scanner) to catch leaks before they merge; a pre-commit hook is the local complement.
- Personal email addresses **MUST NOT** appear in committed files.
  When a file needs an author or committer email, use the value from `git config user.email`.
  Do not substitute a personal email seen in conversation context, memory, or chat history.
  When unsure, run `git config user.email` and use that.
  Where CI is available, add a grep-based check (e.g. `git grep -n '@gmail.com\|@hotmail.com'`) alongside the secret-scanning step to catch personal addresses before they merge.
  Existing violations **MUST** be remediated in the same PR that adds or touches the affected file.
