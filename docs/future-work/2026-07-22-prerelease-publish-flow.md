# Pre-release publish flow

## What

`#local-pr-version` puts a pre-release version (`<target>-rc.<pr-number>`) on every branch with an open PR, and nothing publishes today: there are no CI workflows and no `publishConfig`, so the versions are local identifiers.
When a publish flow is introduced, publish pre-releases under a non-default dist-tag (`npm publish --tag next`), reserve `latest` for versions a human cut at merge, derive the tag from whether the version carries a pre-release suffix rather than from a step someone remembers, and record the practice in `#local-pr-version`.
An alternative kept in reserve: `<target>-rc.<n>+pr.<pr-number>` keeps a real convergence counter and attaches the PR as build metadata, which semver ignores for precedence; not adopted because `rc.<pr-number>` alone is unique, sorts correctly, and traces a build to its PR, and saying nothing about closeness to release is an accepted property of the scheme.

## Why it matters

`npm publish` moves the `latest` dist-tag even for a pre-release unless `--tag next` is passed, so a consumer running `npm i agentsmith` would be handed an rc built off an unmerged branch.
The failure is silent on the publishing side; only the consumer who got the wrong artifact sees it.

## Constraints

- `package.json` is the single source of the version; `tools/claude/.claude-plugin/plugin.json` derives from it via `npm run build:plugin`, so any publish automation regenerates the derived manifest rather than editing it.
- Cutting the final `<target>` is a human decision (`#local-pr-version`); automation must not drop a pre-release suffix on its own.
