# Software engineering

## #swe-agile Agile software development

Follow [Agile software development](https://en.wikipedia.org/wiki/Agile_software_development):
- Ship the smallest slice that delivers real value, then iterate -- working software is the measure of progress, not plans or docs.
- Treat requirements as provisional: revisit assumptions when evidence changes, even late in the work.
- Stay aligned with the people the software is for -- check direction with stakeholders and users, don't build in a vacuum.
- Keep code and architecture only as complex as the problem demands; simplicity (YAGNI) is the default.
- When you find a way to work more effectively, raise it.

## #swe-reuse Reuse before creation

Before creating a component, search the codebase for one with the same name or purpose.
Two components with the same name and purpose in different directories is a bug.
Serve one concept from a single shared implementation across pages or endpoints rather than duplicating it.

## #swe-naming Naming conventions

Each kind of name -- files, identifiers, types -- follows one convention, applied uniformly across the codebase.
A name says what a thing is or does, not how it is built; rename when its purpose drifts.
Match the surrounding code's existing convention over importing a new one (#swe-reuse); which word names a concept is governed by #swe-terminology.

## #swe-future-work Future work

Deferred or out-of-scope work goes in `docs/future-work/<YYYY-MM-DD>-<slug>.md`, stating what it is, why it matters, and any constraints or dependencies.
Record it when the decision to defer is made, not later.

## #swe-technical-debts Technical debt

Each accepted shortcut or known limitation goes in `docs/technical-debts/<YYYY-MM-DD>-<slug>.md`, stating the debt, why it was accepted, its cost or risk, and a remediation sketch.
Record it the moment it is incurred.

## #swe-dated-todos Dated deferral markers

Every in-code deferral marker carries the date it was written, inside the tag: `TODO(2026-06-11): ...`, `FIXME(2026-06-11): ...` (likewise `BUG`, `HACK`, `XXX`).
The date records the marker's age, not a due date -- it lets a later reader or reviewer judge staleness without `git blame`, which a squash-merge (#git-branch-workflow) collapses to a single commit.
A marker that implies real follow-up work belongs in `docs/future-work/` (#swe-future-work) or a technical-debt note (#swe-technical-debts), not left to rot in code.

## #swe-dead-code Dead and disabled code

Delete dead code; **never** comment it out to keep it around: version control is the history (#git-branch-workflow).
Remove unreachable branches, unused identifiers, and disabled blocks in the same change that orphans them.
Code you intend to restore later is deferred work (#swe-future-work), not a commented-out block left to rot.

## #swe-terminology Terminology

Avoid terminology drift.
A concept that appears across users, UI, services, databases, or any other component **MUST** use the same name everywhere.
This governs which word names a concept; #swe-naming governs the form that name takes.

## #swe-entity Entity model upkeep

Core entities (_aka_ core concepts or core abstractions) are documented in the entity model, `docs/reference-spec/entity-model.md` -- the canonical member of the reference spec (#swe-reference-spec) -- and follow rule #swe-terminology.
This file presents a human-readable description of the current model, expressed as pure TypeScript types and interfaces.
The description reflects how users should understand the model.
It is **NOT** documentation of how the model is implemented (_e.g._ not a database schema).
Every change to the entity schema **MUST** be accompanied by an updated entity model.

## #swe-reference-spec Reference spec

The reference spec is the living description of the system as it currently is -- the single place to learn what the software does now.
It lives under `docs/reference-spec/`, created lazily when the first reference document is warranted, **never** preemptively.
It is the counterpart to working specs and plans (#ai-plan): those are immutable point-in-time history, while the reference spec is mutable and always reflects the present.
When the two disagree, the reference spec wins; a working spec is **never** consulted for current truth.
A reference-spec document carries no `Status:` line: the `Draft`/`Approved`/`Implemented` lifecycle (#ai-plan) belongs to working specs and plans, whereas the reference spec has no states -- only the current truth.
The entity model (#swe-entity) is its first and canonical member.
Upkeep is not a separate mechanism: the reference spec is kept current under #swe-docs-drift and gated by #swe-done -- after a change ships, the reference spec is checked and any drift fixed in the same PR.
Where the two could be confused, use the qualified terms "working spec" and "reference spec" (#swe-terminology, #swe-naming); a bare "spec" is fine only where context makes which one unambiguous.

## #swe-docs-drift Documentation drift

Before opening or updating a PR, check for documentation drift -- any doc the change has made stale.
Fix it in the same PR, before opening or updating.
This includes, but is not limited to, the reference spec (#swe-reference-spec) and its entity model (#swe-entity), any `README` or `CONTRIBUTING` file at any level, and files under `docs/`.
Discover the affected docs, do not eyeball them: search the docs for the identifiers, flags, commands, and paths the change touched, and check each hit.
A doc *example* (snippet, CLI invocation, config block, request/response) is stale when it no longer runs or matches the current surface; update it in the same PR or delete it.

## #swe-public-surface-docs Document new public surface

New public surface ships documented in the same change -- a CLI command or flag, endpoint, exported function or type, config key, or env var (#swe-environment).
State what it does, its inputs and outputs, and one example, where consumers already look (`README`, `docs/`, or the reference spec #swe-reference-spec) -- not only in code comments.
Removing surface is the mirror: delete its doc in the same change (#swe-docs-drift).

## #swe-environment Environment and secrets

- Env vars are documented in `.env.example` (committed); `.env` is gitignored and loaded automatically by the code.
- **Never** commit real secrets.
- Personal email addresses **MUST NOT** appear in committed files.
  When a file needs an author or committer email, use the value from `git config user.email`.
  Do not substitute a personal email seen in conversation context, memory, or chat history.
  When unsure, run `git config user.email` and use that.

## #swe-security Security baseline

Beyond secrets (#swe-environment), treat all external input as untrusted: validate and sanitize at the boundary.
**Never** log secrets, tokens, or personal data; redact before logging.
Parameterize queries; **never** build SQL or shell commands by string concatenation.
Where CI is available, scan dependencies for known vulnerabilities and clear criticals before merge.
If there are authentication and authorization layers, enforce them on every endpoint that exposes data or mutations; deny by default.

## #swe-display-messages Display messages

A message is written for whoever reads it -- a UI end user, another team consuming your service's error response, or a developer reading a log.
Make every message (especially information, warning, and error messages) as human-readable as possible for that audience.
Keep deeper reporting detail available (_e.g._ call stack for errors, raw backend response) but initially hidden behind a "show more details" or "copy details to clipboard".

## #swe-errors Error handling and logging

**Never** silently swallow an error: handle it, or propagate it with context added.
Fail loud in development; degrade gracefully in production.
Log at the right level -- `error` for actionable failures, `warn` for recoverable anomalies, `info` for milestones, `debug` for detail.
Logs are structured and greppable, and carry the correlation or trace id (#swe-observability) so lines join across services.
User-facing error text follows #swe-display-messages; internal detail stays in logs and the error object.

## #swe-observability Observability

Beyond logging (#swe-errors), expose the signals needed to see the system's health: key operations emit metrics, and a request crossing services carries one correlation or trace id end to end.
Provide a health or readiness check for any long-running service.
Keep signals actionable -- enough to locate a failure, not vanity counters.

## #swe-deps Dependencies

Justify every new dependency: prefer the standard library, then a small well-maintained package, then writing it yourself.
A dependency **MUST** be actively maintained and license-compatible.
Commit the lockfile and pin versions.
Removing a dependency is a feature -- prune unused ones.

## #swe-testing Testing

Write tests test-first: a failing test before the code that satisfies it.
Every bug fix starts with a test that reproduces the bug.
Assert against the public surface, not internals; where the workflow supports it, tests are authored independently of the implementation.
Tests live beside the code or under `test/`, mirroring the source layout.
A change is not done until its tests pass locally (#swe-done).

## #swe-test-quality Test credibility

A test must be able to fail: assert observable behavior, never that code merely ran; no tautologies or unread snapshots.
Cover the error paths and edge cases the change adds, not just the happy path.
Keep tests deterministic -- no real clock, order, locale, network, or unseeded RNG; a test that flakes counts as failing (#swe-done), fixed at the source or quarantined with a tracked record (#swe-future-work).
Fixtures use synthetic data (#swe-environment, #swe-security), isolated per test, kept in step with the schema.
A test that passes against a mock proves nothing.

## #swe-done Definition of done

A change is done only when all of these hold:

1. Tests for the change pass locally.
   When the repo has no test harness, or the change is genuinely untestable, the verification actually performed is stated and recorded (#git-pr-body, #swe-technical-debts): "done" is never "it compiled."
2. Documentation drift is resolved (#swe-docs-drift), including the reference spec when current behavior changed (#swe-reference-spec) and the entity model when the schema changed (#swe-entity).
3. Unused dependencies are pruned (#swe-deps).
4. New shortcuts or limitations are recorded (#swe-technical-debts); deferred work is logged (#swe-future-work).
5. The change has been self-reviewed against these instructions; self-review is the floor, and a non-trivial diff escalates to a deliberate, independent review pass (#ai-review-board) before it squash-merges to `main`.

Do not open or update a PR before all items hold.

