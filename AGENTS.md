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
