# Marketplace auto-publish for the Claude plugin

## What

The plugin version is bumped by hand in `package.json` and the manifests regenerated with `npm run build:plugin`; no release workflow tags, regenerates, and verifies on publish.
Add one.

## Why it matters

Auto-publish is ergonomics, not correctness: the drift guard test already fails on a stale manifest, so what is missing is the step nobody has to remember.

## Constraints

- The workflow runs `build:plugin`, fails on drift, and tags; it pairs with the version-in-`package.json` convention and the changelog step of `#local-pr-version`.
- A publish flow inherits the dist-tag hazard in `2026-07-22-prerelease-publish-flow.md`.
