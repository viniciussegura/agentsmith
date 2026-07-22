# Future work: pre-release publish flow

Date: 2026-07-22
Status: Deferred (`#swe-future-work`)
Context: `#local-pr-version` in the root `AGENTS.md`; introduced alongside `1.0.0-rc.16`

## The gap

`#local-pr-version` puts a pre-release version (`<target>-rc.<pr-number>`) on every branch with an open PR.
Nothing publishes today -- there are no CI workflows and no `publishConfig` -- so the versions are local identifiers only.

The moment a publish flow exists, one npm default becomes a silent, consumer-facing hazard: `npm publish` moves the `latest` dist-tag even for a pre-release unless `--tag next` is passed.
A consumer running `npm i agentsmith` would then be handed an rc built off an unmerged branch.
The failure is silent on the publishing side -- the publish succeeds and reports nothing unusual -- so it is only visible to the consumer who got the wrong artifact.

## The deferred work

When a publish flow is introduced:

1. Publish pre-releases under a non-default dist-tag (`npm publish --tag next`); reserve `latest` for versions a human cut at merge.
2. Make that a property of the automation rather than a step someone remembers -- derive the tag from whether the version carries a pre-release suffix.
3. Record the resulting practice in `#local-pr-version`, which is the home for this repo's versioning rules.

## Context: what the rc number does and does not tell you

`rc.<pr-number>` is unique, sorts correctly (PR numbers are monotonic), and traces a build back to its PR -- which is what the scheme was chosen for.

It deliberately gives up the usual reading of an rc counter: `rc.1 -> rc.2 -> rc.3` normally signals convergence on the release, whereas PR numbers share a sequence with issues, so the gaps are arbitrary and the number says nothing about how close the target release is.
This is an accepted property of the scheme, not a defect.
If both readings are ever wanted at once, `<target>-rc.<n>+pr.<pr-number>` keeps a real counter and attaches the PR as build metadata, which semver ignores for precedence.

## Constraints

- `package.json` is the single source of the version; `tools/claude/.claude-plugin/plugin.json` derives from it via `npm run build:plugin` (`bin/build-plugin.js`). Any publish automation regenerates the derived manifest rather than editing it.
- Cutting the final `<target>` is a human decision (`#local-pr-version`); automation must not drop a pre-release suffix on its own.
