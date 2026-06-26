# Contributing to agentsmith

This guide is for working **on** agentsmith — authoring the instruction rules and
the generator. If you only want to use agentsmith's conventions in your own
project, the [README](README.md) is all you need.

## Repository layout

```
instructions/      rule sections (the portable source of truth)
  main.md          preamble, emitted first
  core/            ai/ git/ swe/ ...            always-loaded modules
  frontend/        ui-guidelines/ ...           on-demand bundle
  backend/         ...                          on-demand bundle
  ownership.yaml   #tag -> owner map            repo config; NEVER exported
  roles.yaml       review-role metadata         repo config; NEVER exported
tools/             tool-specific adapters, installed into .<ai>/ (shipped to consumers)
  claude/          agents/ skills/ commands/ hooks/   Claude Code adapter (-> .claude/)
    .claude-plugin/plugin.json                        generated plugin manifest
devtools/          maintainer-only dev tooling, never shipped to consumers
  claude/          authoring adapters (instruction-review/apply) installed only with --dev
  triage-ui/       the instruction-review triage server + apply engine
.claude-plugin/marketplace.json   generated single-plugin marketplace (git-subdir -> tools/claude)
manifest.json      preamble, ordered sections (folder + optional when/title), source label
src/generate.js    pure: (preamble, modules, source) -> AGENTS.md text
src/build.js       pure: assembles the lean core, bundle files, and root stub
src/sections.js    pure: splits manifest sections into core vs on-demand bundles
src/bundles.js     on-demand index + #tag reference-integrity + ownership coverage lint
src/tools.js       pure: maps tools/<ai>/** and devtools/claude/** to .<ai>/** install paths
src/specindex.js   pure: renders docs/working-specs/INDEX.md
bin/cli.js         reads sources, writes the files
bin/build-plugin.js  generates plugin.json + marketplace.json from package.json
bin/spec-index.js  regenerate / --check the working-specs index
test/              tests for the generator
```

## Editing the rules

- Each rule has a `#tag` (e.g. `#swe-reuse`) usable as a handle in conversation.
- Rules follow their own `#code-markdown` convention: one sentence per line.
- To add a rule, drop a `.md` into a section group under `instructions/` (e.g.
  `core/swe/` or `backend/`); it is picked up automatically.
- Every `#tag` has exactly one owner (a review role, the `swe` base lens, or the
  `process` non-review marker) in `instructions/ownership.yaml`; adding a rule
  means adding its one owner row, or `npm test`'s coverage lint fails on the
  orphan. Role metadata lives in `instructions/roles.yaml`; both are repo config
  and are never exported.
- To add a section, create a folder under `instructions/` and add an entry to
  `manifest.json` `sections`: a `name` (the folder) plus, for an on-demand
  bundle, a `title` and a `when`; a section with no `when` is always-loaded and
  inlined into the core.
- Files in a section load alphabetically; set a section's `modules` to an
  explicit file list to override that order.
- Section order in the output follows `manifest.json`.

Set `manifest.json` `source` to your actual repo URL; it appears in the
generated file's header.

## Authoring tooling (`--dev`)

The instruction-review / -apply engine and its meta-agents live under
`devtools/claude/` and install only with `--dev` — they audit and edit *this
repo's* instruction source and cannot run in a consumer project. Dogfood install:
`node bin/cli.js --dev`. The triage UI (`npm run triage`) drives the worksheet.

## Records and history

How this repo organizes its specs, decisions, and history — the
present-truth / point-in-time families — is in
[`docs/documentation-model.md`](docs/documentation-model.md). New work follows
`#ai-plan`: a working spec under `docs/working-specs/<date>-<slug>/`, indexed by
`agentsmith spec-index`.

## Development

```bash
npm test                     # node --test
npm run build -- --stdout    # preview the forged AGENTS.md
npm run build:plugin         # regenerate plugin.json + marketplace.json
npm run build:index          # regenerate docs/working-specs/INDEX.md
node bin/cli.js --dev        # dogfood install, including the authoring tools
```
