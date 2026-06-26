# Instruction-set coexistence: precedence, gap, and drift

**Date:** 2026-06-25
Status: Implemented
**Origin:** `tmp/user-rules-feedback.md` — feedback from a downstream project running this
generated set at user scope beside a Java/Spring project `CLAUDE.md`.

## Problem

The generated instruction set (`AGENTS.md`, forged from `instructions/`) is designed to be
stack-agnostic and is loaded at user scope across projects. When a project ships its own
project-scoped instruction file, three frictions surface:

1. **Conflicts with no resolution rule.** The preamble (`instructions/main.md`) states
   *conversation* precedence but is silent on *project-file vs this-file* precedence. Three
   concrete collisions follow from that silence:
   - 1.1 comments philosophy (`#code-style` "no gratuitous comments" vs a project that wants
     rich explanatory comments);
   - 1.2 rule-citation style (`#ai-conversational` terseness + `#tag` citation vs a project
     that mandates its own `@Rule` citation — double-tagging fights terseness);
   - 1.3 multiple-solutions default (the "recommendation, not survey" bias — which lives only
     in the harness system prompt, not in the portable set — vs a project that wants options
     enumerated every task).
2. **A genuine gap.** Deep modules / information hiding (Ousterhout) is stack-agnostic and
   currently unrepresented; `#swe-decomposition` touches the edge (when to split) but not
   module depth or error-design (what a good boundary looks like).
3. **Duplication drift.** Downstream project files paraphrase canonical `#tag` rules instead
   of referencing them, so an edit to the canonical rule leaves a stale paraphrase behind.

## Decisions

- **Precedence direction:** project file wins wholesale on conflict, with a **safety floor**.
- **Deep modules:** a **new sibling rule** `#swe-deep-modules`, not an extension of
  `#swe-decomposition`.
- **Drift:** documentation guidance for downstream authors, not a behavior rule.

## Design

### Piece 1 — Precedence chain in `instructions/main.md` (root cause of 1.1–1.3)

Add to the preamble, phrased *relatively* so it holds whether the set is deployed at user or
project scope:

> Precedence on conflict: user instructions in the active conversation > a more
> project-specific instruction file > this file. A project-scoped instruction file may
> override any rule here — except the safety baseline (`#git-secret-history`,
> `#ai-untrusted-content`, `#swe-security`, `#ai-tool-safety`), which a project may tighten
> but not waive.

The existing "User instructions in the active conversation override this file." line is
absorbed into this chain. This single statement resolves 1.1/1.2/1.3 at the cause.

### Piece 2 — Thin per-rule pointers (the named high-friction spots)

With Piece 1 carrying the logic, these are one-liners:

- `#code-style` += "A project file may opt into a heavier comment style; where it does, defer
  to it (see preamble precedence)."
- `#ai-conversational` += "If a project defines its own rule-citation convention, adopt it
  instead of stacking `#tag` citations — don't double-tag."
- `#ai-conversational` += "Give a recommendation, not an exhaustive survey; enumerate options
  only for genuinely open choices, not as a per-task ritual." (Codifies a default currently
  living only in the harness prompt; 1.3 dissolves.)

### Piece 3 — New rule `#swe-deep-modules`

New file `instructions/core/swe/swe-deep-modules.md`, owned by `swe`. Pointer-not-enumeration,
matching how `#front-nielsen-heuristics` was kept:

> Favor deep modules: a simple interface over a substantial implementation — the surface a
> caller must understand stays small relative to what it hides (`#swe-public-surface-docs`).
> Hide detail behind the interface; pull complexity downward. Define errors out of existence
> where you can: shape the interface so a class of error cannot arise rather than exposing it
> for every caller (`#swe-errors`). A shallow module — interface nearly as complex as its
> body — adds cost without hiding much. Complements `#swe-decomposition` (*when* to split) by
> saying *what a good boundary looks like*. See "A Philosophy of Software Design" (Ousterhout).

One new `ownership.yaml` row under the swe block: `swe-deep-modules: swe`. The coverage lint
(`src/bundles.js`) then passes; `swe` is the base lens so `review-swe` already reads it.

### Piece 4 — Duplication-drift guidance (docs)

A short note in `README.md` advising downstream project files to *reference* `#tag`s rather
than paraphrase canonical rules, so a canonical edit does not strand a stale paraphrase.
Consumer-facing; not part of the instruction set.

## Out of scope (confirmed by the feedback)

Stack/tooling specifics, framework idioms, generated-contract discipline (OpenAPI/DTO) — all
legitimately project-owned, no generic hook.

## Verification

- Re-run the generator; `AGENTS.md` regenerated with the new preamble, the two amended rules,
  and `#swe-deep-modules` in the core SWE section.
- Ownership coverage lint green (no orphan/duplicate/unowned tag).
- Existing tests under `test/` pass.
