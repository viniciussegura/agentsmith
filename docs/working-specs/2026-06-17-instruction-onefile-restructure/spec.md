# Spec: one-file-per-tag instructions + triage workflow v2

Status: Draft

## Motivation

Two pains, one root.

Instructions live as a few multi-rule markdown files (`instructions/core/swe.md`
holds ~15 `## #tag` sections). Every consumer reads the **generated** output
(`node bin/cli.js`), never the sources as-is, so the multi-rule file is a
storage convenience, not a contract. It costs us:

- **Fragile section capture.** Reading/replacing one rule means parsing
  `## #tag -> next ## / EOF`. The triage worksheet stored a verbatim `current`
  copy of each section; a nested code fence truncated `be-api-first` (fixed in
  `44ca350`, but the whole class is structural).
- **Uniqueness by lint, not by construction.** Two rules with the same tag is a
  bug caught by the ownership lint; the filesystem could enforce it for free.
- **Triage is chat-coupled.** Refine questions get discussed in the chat
  transcript, away from the artifact; verdict notes accrue as noise; apply has
  been hand-rolled (and the one hand-transcribed entry is the one that broke).

One rule per file fixes the storage half; a triage workflow v2 fixes the
process half. They are folded into one spec because v2's apply engine gets
materially simpler once a rule is a whole file (write a file, not splice a
section).

## What already exists (leverage, don't rebuild)

- `manifest.json` `sections` map directory -> section; a section with `when`
  becomes an on-demand bundle, without `when` it inlines into the lean core.
- `src/generate.js` `demoteHeadings` already shifts a module's headings down one
  level so an inlined module nests under the preamble's h1.
- `bin/cli.js` `listFiles` already orders a section's files **alphabetically**
  (a section may pin order via `modules`).
- `instructions/ownership.yaml` is already a pure `tag -> owner` map, decoupled
  from file location; `ownershipCoverage` lints orphans/double-ownership.

The restructure extends these (tree-depth awareness, per-tag files); it does not
replace the assembly core.

## Decisions (locked in brainstorming)

- **One file per tag**, filename = `<tag>.md`, authored at **h1**
  (`# #<tag> Title` + body).
- **Group dir** = `_intro.md` (group heading + prose, authored h1) + its tag
  files. Invariant: a **leaf dir is one group** (holds `_intro.md` + tag files);
  a **branch dir holds only subdirs**. Sections are either: `core` and
  `frontend` branch into group dirs; `backend` and `authoring` are leaf groups.
- **Ordering**: alphabetical; `_intro.md` sorts first by name; a section/dir may
  pin order via the existing manifest `modules` mechanism. This reproduces the
  current emitted order (ai, code, git, swe).
- **Heading level = tree depth** (depth-aware demotion).
- `ownership.yaml` stays the pure owner-map; **path = presentation, ownership =
  accountability** (they may differ).
- Triage v2: drop the verdict note on `adopt`/`park` (keep the `reject`/`fold`/
  `defer` reason — it is the committed decisions-log output); add a single
  `lastRoundReply` field; **stop storing `current`** (read live from the rule
  file); promote apply to a shared committed module.

## Target tree (illustrative)

```
instructions/
  main.md                      preamble (root h1), unchanged
  ownership.yaml               unchanged
  roles.yaml                   unchanged
  core/                        branch (inlined into lean core)
    ai/      _intro.md (# Agent behavior), ai-plan.md, ai-conversational.md, ...
    code/    _intro.md (# Code), code-style.md, code-markdown.md
    git/     _intro.md (# Git), git-title.md, git-pr-body.md, ...
    swe/     _intro.md (# Software engineering), swe-errors.md, swe-reuse.md, ...
  frontend/                    branch (bundle, when "Front-end or UI work")
    front/   _intro.md (# Front-end), front-a11y.md, ...
    ui/      _intro.md (# UI guidelines), ui-canonical-states.md, ...
  backend/                     leaf (bundle): _intro.md (# Back-end), be-api-first.md, ...
  authoring/                   leaf (bundle): _intro.md, instruction-review.md split per tag
```

## Phase 1 -- restructure (behavior-preserving)

### 1.1 Generator: depth-aware demotion

- The section resolver (today `resolveSections` + `bin/cli.js` `listFiles`)
  becomes tree-aware: for a section, walk the subtree depth-first, directories
  alphabetically, `_intro.md` before tag files within a dir, yielding an ordered
  list of `{ path, depth }` where `depth` is the dir nesting below the section
  root.
- `demoteHeadings(markdown, by)` generalizes the current fixed one-level shift to
  `by` levels (clamp at h6, fences untouched).
- **Core (inlined):** `main.md` is the h1 root. A depth-1 group `_intro` demotes
  by 1 -> h2; its tags (depth 2) demote by 2 -> h3. Matches current output
  (group h2, rule h3).
- **Bundle:** the bundle file's h1 title comes from manifest `title` (today's
  behavior). The section subtree demotes beneath it: for a leaf section
  (`backend`) `_intro.md` (depth 0) demotes by 1 -> h2 under the title, tags
  (depth 0, same dir) ... see open detail below. For a branch section
  (`frontend`) group `_intro`s land at h2, tags at h3.
- Lints (`scanTags`, `ownershipCoverage`, `danglingTags`, `coreToBundleRefs`)
  are text-based and unchanged.

**Open implementation detail (resolve in the plan, not a spec ambiguity):** in a
leaf section the `_intro.md` and the tag files share one directory (depth 0), so
both would demote equally. Intended output: `_intro` heading one level above the
rules. The plan picks one of: (a) tag files implicitly +1 relative to a sibling
`_intro`, or (b) author tag files at h2. The acceptance gate (byte-identical
output) decides correctness regardless of which.

### 1.2 Migration (one-time script)

- Split each existing multi-rule file: every `## #tag ...` section ->
  `<group>/<tag>.md` with the heading promoted h2 -> h1; the file's leading
  `# Title` + any intro prose -> that group's `_intro.md`.
- Build the directory tree; update `manifest.json` only if a group needs a
  non-alphabetical pin.
- **Acceptance gate (the safety proof):** `node bin/cli.js --stdout` output is
  byte-identical before vs after (modulo trailing whitespace). Also: the defined
  tag set is unchanged, `ownershipCoverage` is clean, `node --test` is green.
- Delete the old multi-rule files once the gate passes.

### 1.3 Phase 1 done-criteria

Byte-identical emit, green suite, ownership lint clean, old files removed. Ships
independently of Phase 2.

## Phase 2 -- triage workflow v2

### 2.1 Schema (`devtools/triage-ui/schema.mjs`)

- `decision.details`: required for `reject`/`fold`/`defer`/`refine`; **forbidden
  for `adopt`/`park`** (validateEntry reports a problem if present).
- Add optional `lastRoundReply: string` -- the agent's reply to the current
  refine `details`. Single field; overwritten on a new reply (no thread
  history -- accepted trade-off).
- **Remove `current`** from the schema: `strengthen` requires only `draft`; the
  diff source is the live rule file. `new-rule` unchanged (no current). A
  present `current` is ignored -- no longer part of the contract; the migrator
  and `/instruction-review` emit stop writing it.
- `targetFile` = the per-tag rule file path (e.g.
  `instructions/core/git/git-title.md`).

### 2.2 Apply engine (`devtools/triage-ui/apply.mjs`, committed, shared)

- Exports `apply({ triagePath, root, runTests })` returning the report
  (adopted/rejected/folded/deferred/refined/parked/failed). Plus a CLI entry.
- Validate (validateFile + validateCrossRefs) once; malformed -> report + skip.
- Per entry by `decision.verdict`:
  - `adopt` (status ready): **write/create the rule file = `draft`**;
    `new-rule` also ensures the `ownership.yaml` row; `rehome` moves the file;
    `reowner` rewrites the ownership row. Regenerate + `node --test` gate;
    per-entry snapshot recovery; on failure -> `decision={verdict:'park'}` +
    push to `applyLog`.
  - `reject`/`fold`/`defer`: ensure the decisions-log line in canonical grammar.
  - `refine`: leave; surface with `details` + `lastRoundReply`.
  - `park`: leave.
  - On each terminal success: splice the entry, atomic canonical rewrite.
- `/instruction-apply` skill becomes thin: validate -> `apply()` -> report. The
  hand-edit step (the weak link this session) is gone; apply is deterministic.

### 2.3 Server + UI (`devtools/triage-ui/`)

- `POST /api/apply`: **clean-base preflight** (refuse if `instructions/` +
  `ownership.yaml` carry unrelated uncommitted edits), run `apply()`, return the
  report.
- Header **Apply** button: confirm dialog listing what will apply -> POST ->
  render report -> reload the worksheet.
- Diff source: server reads the live `targetFile`; UI diffs live-vs-`draft`.
- Refine entry: render `details` (human question) + `lastRoundReply` (agent
  answer) as a panel; the human edits `details` in the UI. Verdict note input
  hidden for `adopt`/`park`.

### 2.4 Tests + export

- Unit: depth-aware resolver/demotion; migration byte-identical; `apply.mjs`
  (adopt write/create, new-rule + ownership row, reject log line, splice, per-
  entry recovery); schema v2 (details required/forbidden matrix, `lastRoundReply`,
  no `current`). The export test still proves `devtools/` is neither installed
  nor published.

## Out of scope

- Changing instruction **content** (this is a storage + workflow change).
- The `/instruction-review` emit beyond pointing `targetFile` at per-tag files
  and dropping `current` (it already emits JSON directly).
- Multi-turn refine thread history (single `lastRoundReply` by decision).
- Any change to `ownership.yaml` / `roles.yaml` semantics.

## Risks

- **Migration not byte-identical.** Mitigated by making byte-identity the hard
  gate; if it diverges, the migration script is wrong, not the sources.
- **Bundle leaf-section heading level** (the open detail in 1.1) -- bounded by
  the same gate.
- **File count** (~40 files). Accepted; dir-grouped and navigable.
```
