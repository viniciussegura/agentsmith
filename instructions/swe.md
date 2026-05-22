# Software engineering instructions

## #swe-environment Environment and secrets

- Environment variables are documented in `.env.example` at the repo root.
- Never commit real secrets.
  `.env` is gitignored; `.env.example` is committed.
- The code should read `.env` automatically.
- **Personal email addresses must never appear in committed files.**
  When a file requires an author / committer email, use the email configured in `git config user.email`.
  AI assistants must not substitute a personal email address even if one is visible in the conversation context (`<userEmail>`, memory files, chat history).
  When in doubt, run `git config user.email` first and use that value.

## #swe-reuse Reuse before creation

Before creating a new component, search the existing codebase for one with the same name or purpose.
Two components with the same name in different directories is a bug.

The focus should be on the core concept and feature, not in the instantiation.
For example, a code that shows a list of the X concept in many different pages (frontend) or endpoints (backend), should strive to have a single shared implementation to serve all locations.

## #swe-future-work Future work and directions

Any deferred work, future direction, or out-of-scope idea worth keeping is registered as its own file under `docs/future-work/`.
The filename pattern is `<YYYY-MM-DD>-<issue-slug>.md`, where `<YYYY-MM-DD>` is the date the entry is created and `<issue-slug>` is a short kebab-case identifier.
Each file states what the work is, why it matters, and any known constraints or dependencies.
Deferred scope is recorded here as soon as the decision to defer is made, not left implicit in conversation or commit messages.

## #swe-technical-debts Technical debts

Every consciously accepted shortcut, simplification, or known limitation is registered as its own file under `docs/technical-debts/`.
The filename pattern is `<YYYY-MM-DD>-<issue-slug>.md`, identical in form to the future-work convention.
Each file states the debt, the context and reason it was accepted, the cost or risk it carries, and a sketch of how it would be remediated.
Debt is recorded at the moment it is incurred, not retroactively.
