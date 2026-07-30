# Migrate `#local-verify-the-gate` into the shipped instruction set

Date: 2026-07-30

## What

`#local-verify-the-gate` lives in the root `AGENTS.md` under **Local rules** -- project-scoped to this repo, never generated into the shipped set. Promote it to `instructions/core/ai/` as `#ai-verify-the-gate`, so it loads in every consumer's generated core.

The rule: before writing a command or a count into a spec, a PR body, or a done-claim, execute that exact command against the exact corpus it gates, and say which corpus that was.

## Why it matters

Nothing in the rule is agentsmith-specific. It names a general failure of agent honesty -- a written claim about verification that was never performed -- and every consumer of this instruction set is exposed to it. It is also the rule that makes two shipped rules mean anything:

- `#swe-done` item 2 requires stating the verification actually performed.
- `#git-pr-body` item 3 requires the concrete commands run and their output, "not a bare it works".

Both are satisfiable today by stating commands that were never executed. This rule is the pre-write obligation that closes that gap, and it ships nowhere.

## Evidence

The 2026-07-30 ephemeral-working-specs unit violated it four times in one session, all caught by `#ai-spec-review` at roughly one round each:

1. **A count derived from the wrong artifact.** "6 directories" written into the spec, read off a grep's hit list rather than counted from the corpus; the real number was 25. Written *before* the author had read the rule -- it is not in the loaded core, only in root `AGENTS.md`.
2. **A command written from idiom, never run.** `npm run build -- --stdout` in a Verification table; the `build` script is `node bin/cli.js install`, so it expands to `install --stdout` and exits non-zero. `CONTRIBUTING.md` documented the same broken form, which is what made it look already-verified.
3. **A gate over a corpus the command cannot read.** `git grep ... -- instructions .agentsmith/AGENTS.md`; `.agentsmith/` is gitignored and `git grep` reads tracked files only, so that half of the criterion could never fail.
4. **A quoted span written from intent.** A directive to strike `#ai-spec-review`:14's "only the final spec is committed" quoted to the line's end, silently swallowing a second clause on the same line that had to survive -- the set's only statement that review scratch stays uncommitted.

Items 2-4 occurred *after* the rule had been read, so discoverability explains only the first.

## The mechanism, and what migration does not fix

The common shape: **intent and reality render as identical prose.** A command written from what the author means it to do is textually indistinguishable from one that was executed, so nothing in the act of writing prompts the switch into verification. The cost is inverted -- verifying costs a tool call now, skipping it costs a review round later, and the feedback arrives too late to teach.

Migration fixes **discoverability** (the rule enters every session's loaded core) and **reach** (consumers get it). It does **not** fix enforceability. The rule is unverifiable prose with no hook, test, or lint -- the same property it condemns in a criterion that "trains the next reader to ignore it". In this session the only thing that caught all four was an adversarial review round.

## What migration involves

- **Rename and rehome.** `#local-verify-the-gate` -> `#ai-verify-the-gate`, at `instructions/core/ai/ai-verify-the-gate.md`. The `#local-` prefix marks a repo-scoped rule and cannot ship.
- **One `ownership.yaml` row.** The `ai` meta lens owns process rules governing agent behavior; without the row, `npm test`'s coverage lint fails on the orphan.
- **Generalize the repo-local body.** Two passages are specific to this checkout and must not ship: the provenance line citing a 2026-07-22 audit of this repo, and a note that `grep -E '\b...'` is unsupported "by some grep builds on PATH here". Keep the substance (a near-variant pattern is not the pattern), drop the machine-specific claim.
- **Check for overlap (`#swe-reuse`).** Adjacent but not duplicative: `#swe-test-quality`'s "a test must be able to fail" is the same idea one tier down, and `#swe-done` / `#git-pr-body` are the post-hoc statements this rule makes honest. It earns its own tag.
- **Decide whether the local rule is deleted or left as a pointer.** Leaving both invites drift between two copies of one rule -- the failure `#swe-reuse` names.

## Open question: the mechanical complement

Migration alone leaves the rule enforced only by review. Worth deciding at the same time whether anything cheap can carry part of the load, e.g. a check that every fenced command in a spec's Verification section was actually executed in the session that wrote it, or a convention that such commands are pasted with their exit status rather than written prose-style.

An unenforceable rule is not worthless -- this one is kept for the same reason the design-decision slug convention is: it is beneficial and fails soft. But its failure mode is silent, and that is worth naming in the rule text itself if no mechanism is added.

## Constraints

- This is a change to the shipped instruction set: it needs its own working spec (`#ai-plan`), since it introduces public surface (a new `#tag`) and touches more than one file.
- The tag name must not collide with the review board's lens ids or an existing `#ai-*` tag.
- Any new rule text is subject to the same instruction-integrity gates: no dangling `#tag` references, exactly one owner.

## Provenance

Raised at the close of the 2026-07-30 ephemeral-working-specs unit, after that unit's own review surfaced four violations of the rule. Recorded rather than actioned: promoting a rule into the shipped set is its own unit of work, not a rider on the branch that happened to expose the need.
