# Plan: Spec auto-review

Date: 2026-05-30
Status: Implemented
Spec: `docs/specs/2026-05-30-spec-auto-review.md` (approved)

## Overview

Three deliverables, in dependency order: the portable instruction rule, the Claude adapter under `tools/claude/`, and the generator step that installs the adapter into `.claude/`.
Docs and tests land alongside the code they cover (#swe-done).

## Step 1 -- Portable instruction rule `#ai-spec-review`

Edit `instructions/core/ai.md`, add `#ai-spec-review` immediately after `#ai-plan`.
Terse, self-contained, one sentence per line (#code-markdown); the full mechanics live in the spec and the skill, the rule is the contract.
Content:

- Trigger: after writing or substantially revising a spec under `docs/specs/`, offer the auto-review and wait; never start unprompted.
- On opt-in, an adversarial spec-specialist reviewer and the author alternate in rounds: reviewer writes findings (blocking/nit with stable ids), author revises and writes a rebuttal (resolved/wontfix), next reviewer reads the current spec, the latest rebuttal, and the ledger.
- Convergence guard: zero open blockers = converged; two consecutive reviews that fail to beat the best open-blocking count seen so far = stalled (earliest review 3); 5-round cap; on stall or cap, stop and ask the user.
- Only the final spec is committed; per-round reviews and rebuttals are ephemeral under `.agentsmith/tmp/` and never committed.
- Cross-reference `#ai-plan`; both are core, so no lean-split dangling risk.

Verify `node bin/cli.js --stdout` shows no dangling/cross-boundary warnings for the new tag.

## Step 2 -- Claude adapter under `tools/claude/`

New committed source tree (the dogfood proved the reviewer prompt and the loop):

- `tools/claude/agents/spec-specialist.md` -- subagent. Frontmatter `name`, `description`, read-only tool set; body is the adversarial reviewer persona and the finding/id output schema (derived from the dogfood reviewer prompt).
- `tools/claude/skills/spec-review/SKILL.md` -- orchestrator skill. Frontmatter `name`, `description` (triggers on "review this spec" / post-spec offer); body drives the round loop: spawn `spec-specialist` per round via Task, collect findings, prompt the author to revise and rebut, maintain the ledger, write scratch to `.agentsmith/tmp/spec-review/<slug>/`, evaluate the convergence guard, escalate to the user on stall/cap.
- `tools/claude/skills/spec-review/finding-format.md` -- reference: finding id, blocking/nit, resolved/wontfix, rebuttal schema.
- `tools/claude/commands/spec-review.md` -- `/spec-review <spec-path>`: manual entry that runs the skill on an existing spec.

## Step 3 -- Generator installs `tools/<ai>/` into `.<ai>/`

- New module `src/tools.js`, pure planner `planToolInstall(sourceRelPaths)` mapping `tools/<ai>/<rest>` -> `.<ai>/<rest>`.
  Keeps the pure-core / IO-shell split that `src/build.js` and `bin/cli.js` already use.
- `bin/cli.js`: after writing the AGENTS.md outputs, discover files under `pkgRoot/tools/`, plan their destinations, and copy each into `process.cwd()` (read source, `mkdirSync`, `writeFileSync`), logging each write like the existing `writeOut`.
  Namespaced and non-destructive: only the adapter's own files are written; nothing else under `.claude/` is touched or deleted.
- Flags: default-on; `--no-tools` opts out; `--stdout` (preview) skips the install, matching its existing dry-run behavior.
- `package.json`: add `"tools/"` to `files` so the adapter ships via `npx`.

## Step 4 -- Tests

- `test/tools.test.js`: unit-test `planToolInstall` -- `tools/claude/skills/spec-review/SKILL.md` -> `.claude/skills/spec-review/SKILL.md`, and the `<ai>` generalization.
- `test/cli.test.js`: add cases -- a default run writes `.claude/agents/spec-specialist.md`, `.claude/skills/spec-review/SKILL.md`, `.claude/commands/spec-review.md`; `--no-tools` writes none of them; a pre-existing unrelated `.claude/` file survives the run (mirrors the "never clobbered" test).
- `npm test` green.

## Step 5 -- Docs drift (#swe-docs-drift)

- `README.md`: update the opening objective to the spec's broadened-scope wording; add `tools/` and the install behavior to **Structure**; document `--no-tools` and the `.claude/` install under **Usage**/flags.
- `docs/specs/2026-05-30-spec-auto-review.md`: set status to Approved / implemented.

## Done criteria (#swe-done)

1. `npm test` passes.
2. `node bin/cli.js --stdout` emits no dangling/cross-boundary warnings.
3. A scratch `npx`-style run in a temp dir installs the three `.claude/` files and respects `--no-tools`.
4. README and spec status updated; no remaining drift.
5. Self-review against the instruction set.

## Risks / notes

- Installing into a consumer's `.claude/` is opinionated; mitigated by namespacing to agentsmith-owned paths and the `--no-tools` opt-out. If this proves too pushy, a follow-up can gate it behind an explicit `--install-tools` instead (record as #swe-future-work if we defer).
- The skill/command/subagent are exercised manually first (as in the dogfood); end-to-end runtime validation in Claude Code is a post-merge check, not a unit test.
