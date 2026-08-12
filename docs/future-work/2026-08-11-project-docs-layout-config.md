# A project config remapping the `#swe-docs-layout` rows

Date: 2026-08-11

## What it is

A per-project YAML config under `.agentsmith/` that lets a project point any `#swe-docs-layout` row somewhere other than its default `docs/` path -- or declare that the row is served by an external system.

Two motivating shapes:

- A project that tracks debt and deferred work in **Jira or GitHub Issues**. The corresponding files are then working notes, not records: they should be registered in the tracker, and the local file (if any) is temporary.
- A project that already keeps **ADRs** in its own directory (`docs/adr/`, `doc/decisions/`). Today `#swe-design-decisions` names `docs/design-decisions/`, so such a project either duplicates the concept or ignores the rule.

`install` creates the file on first run when it is absent, and the installer tells the user to except it from the gitignore.

## Why it matters

`#swe-docs-layout` is currently absolute: it names one path per record type and offers no seam. A consumer whose repo disagrees has to fork the rule, and a rule a project silently ignores is worse than one it never installed.

The instruction set already states that a project-scoped instruction file may override any non-safety rule, so the *permission* exists. What is missing is a machine-readable declaration the generator can act on, so the emitted `#swe-docs-layout` table describes the project's real layout instead of a default the reader has to mentally remap.

## Constraints and dependencies

- **The gitignore tension is the crux.** `.agentsmith/` is the directory the README tells consumers to ignore wholesale, and everything else agentsmith writes there is per-machine working state. A layout decision is the opposite: it is a team decision that must be shared, so the file needs an explicit re-admit (`!.agentsmith/<name>.yaml`), and `install` must say so rather than leaving the user to discover that their config is invisible to teammates. The README's "if you do commit them" gitignore recipe already has the shape to extend.
- **The generator has to read it**, not just the agent. Instructions are consumed by an LLM reading `AGENTS.md`; a config file nothing parses changes nothing. This lands in `src/`, at the point the `#swe-docs-layout` module is rendered -- so it is the first case of a rule whose *content* is project-dependent, and that is the design question the spec must answer: templated rows, an appended override table, or a post-render rewrite.
- **`#swe-docs-layout` is the single source of truth for these paths** (`docs/reference-spec/documentation-layout.md`), and every owner rule cites it rather than restating a path. That is what makes a one-place remap possible; it also means the override must flow through the same map, never into the owner rules.
- Rows whose home is an external tracker need a distinct treatment from rows merely relocated: "this record type lives in Jira" changes what the owner rule tells the agent to *do* (register it there), not just where to write.
- Interacts with the review board's own promotion path, which already models "the durable record is the external tracker" (`#ai-review-board`). Reuse that framing rather than inventing a second one.

## Status

Deferred at the point of raising (2026-08-11), scope-split from the branch carrying the board-driver fixes: it needs its own spec, and unlike those fixes it changes the generator rather than a shipped script.
