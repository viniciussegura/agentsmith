<!-- Consumer-owned. agentsmith generates .agentsmith/AGENTS.md; reference or extend it here. -->

See `.agentsmith/AGENTS.md` for generated agent instructions.

## Local rules

Project-scoped, never generated into the shipped set.

### #local-pr-version Pre-release version per PR

When a branch opens a PR, set the package version to a pre-release of the target release, differentiated by the PR number: `<target>-rc.<pr-number>` (e.g. `1.0.0-rc.16` for PR #16).

- Bump `package.json`, then run `npm run build:plugin`: `tools/claude/.claude-plugin/plugin.json` derives its version from it and drifts silently otherwise.
- The bump happens once the PR number exists, and rides on the branch like any other change (#git-branch-workflow) -- it is not a separate release commit.
- A branch with no PR carries no bump.
- The human cuts the final `<target>` at merge; an agent **never** drops the pre-release suffix on its own, because doing so declares a release.

### #local-verify-the-gate Run a verification command against the corpus it gates

Before writing a command or a count into a spec, a PR body, or a done-claim, **execute that exact command against the exact corpus it gates**, and say which corpus that was.

- **Pre-edit and post-edit are different corpora.** A criterion that gates the finished work must be derived from the finished work -- including the effect of the change's own edits on it. A count validated before the edits is not evidence about after them.
- **The command you run must be the command you write down.** Not a near-variant: `grep 'swe-done'` and `grep '#swe-done'` differ (the first also matches the file path in `-rn` output), as do a substring and a word-boundary match, and `grep -E '\b...'` is unsupported by some `grep` builds on PATH here -- use `-w -e <word>`.
- **When a criterion's value depends on prose you are also writing, check that prose against every pattern that counts it** -- not only the one you were last corrected on.
- A criterion whose own failure clause would trip on a correct implementation is worse than no criterion: it trains the next reader to ignore it.

Seven rounds of `#ai-spec-review` on `docs/working-specs/2026-07-22-instruction-terminology-audit/` produced six findings of exactly this class, in every one of its forms above. It is a habit, not an accident, and the cost is a review round each time.
