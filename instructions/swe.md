# Software engineering

## #swe-environment Environment and secrets

- Env vars are documented in `.env.example` (committed); `.env` is gitignored and loaded automatically by the code.
- Never commit real secrets.
- Personal email addresses must never appear in committed files.
  When a file needs an author or committer email, use the value from `git config user.email`.
  Do not substitute a personal email seen in conversation context, memory, or chat history.
  When unsure, run `git config user.email` and use that.

## #swe-reuse Reuse before creation

Before creating a component, search the codebase for one with the same name or purpose.
Two components with the same name in different directories is a bug.
Serve one concept from a single shared implementation across pages or endpoints rather than duplicating it.

## #swe-future-work Future work

Deferred or out-of-scope work goes in `docs/future-work/<YYYY-MM-DD>-<slug>.md`, stating what it is, why it matters, and any constraints or dependencies.
Record it when the decision to defer is made, not later.

## #swe-technical-debts Technical debt

Each accepted shortcut or known limitation goes in `docs/technical-debts/<YYYY-MM-DD>-<slug>.md`, stating the debt, why it was accepted, its cost or risk, and a remediation sketch.
Record it the moment it is incurred.
