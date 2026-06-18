# Spec: one-file-per-tag instructions + triage workflow v2

Status: Approved

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
- **Group dir** = `_intro.md` + its tag files. `_intro.md` is its source file's
  content **above the first `## #tag`**, verbatim (the h1 it had, if any, plus
  intro prose); a file with no h1 (e.g. `authoring`) yields a heading-less,
  prose-only `_intro.md`. Invariant: a **leaf dir is one group** (`_intro.md` +
  tag files); a **branch dir holds only subdirs**. `core` and `frontend` branch
  into group dirs; `backend` and `authoring` are leaf groups.
- **Group routing**: a tag's group is **the source file it lives in today**; the
  group dir is named for that file's basename (`front.md` -> `front/`,
  `ui-guidelines.md` -> `ui-guidelines/`, `swe.md` -> `swe/`). So
  `#ui-framework-idioms`, which lives in `front.md`, joins `front/`, **not**
  `ui-guidelines/` (F19).
- **Ordering**: alphabetical by filename (= tag), `_intro.md` emitted first by
  the resolver (special-cased, not byte-sort). This *is* the generator's existing
  `listFiles` default -- **no order-pin mechanism**. Alphabetical group-dir order
  already reproduces today's cross-group order (ai, code, git, swe; front,
  ui-guidelines); today's **within-group** order is authored (non-alphabetical in
  5/8 groups), so a one-time reviewed reorder (Phase 1 pre-step, 1.2) brings it
  to alphabetical, after which filename sort is the order and adding a rule is
  just dropping in a file.
- **Heading level is role-based** (not raw tree depth): the core root
  (`main.md`) / bundle title preamble is h1; a group `_intro.md` demotes by 1
  (-> h2); a tag file demotes by 2 (-> h3). The tree is exactly two heading
  levels (group, rule); deeper nesting is out of scope.
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
    ai/             _intro.md (# AI), ai-plan.md, ai-conversational.md, ...
    code/           _intro.md (# Code standards), code-style.md, code-markdown.md
    git/            _intro.md (# Git), git-title.md, git-pr-body.md, ...
    swe/            _intro.md (# Software engineering), swe-errors.md, ...
  frontend/                    branch (bundle, when "Front-end or UI work")
    front/          _intro.md (# Front-end instructions), front-a11y.md,
                    front-cdn.md, ui-framework-idioms.md   (lives in front.md today)
    ui-guidelines/  _intro.md (# UI Guidelines), ui-canonical-states.md, ...
  backend/                     leaf (bundle): _intro.md (# Back-end instructions), be-api-first.md, ...
  authoring/                   leaf (bundle): _intro.md (prose only, no h1), ai-instruction-review.md
```

The `_intro.md` h1s shown are the **exact current** file h1s; the migration
copies each verbatim (the strict-diff gate, 1.3, enforces byte-identity).
`authoring` has no h1 today, so its `_intro.md` is prose-only. `front.md` and
`backend.md` h1s happen to equal their bundle `title`, reproducing today's
(redundant but unchanged) title-then-group-heading output -- preserved, not
"fixed," to keep the diff empty.

## Phase 1 -- restructure (content-preserving)

**Atomicity (F1).** The tree-aware resolver (1.1) and the file move (1.2) are
**one atomic change**, committed together. The current resolver
(`bin/cli.js` `listFiles` = `readdirSync(instructions/<name>)` one level, `.md`
only; `resolveSections`) would see an empty `core/` the instant its files move
into subdirs, so the move cannot land before the recursive resolver. The
acceptance gate (1.3) compares **pre** (old tree + old resolver) `--stdout`
against **post** (new tree + new resolver) `--stdout`.

### 1.1 Generator: role-based demotion

- The resolver becomes tree-aware: for a section, walk the subtree depth-first,
  directories alphabetically; within a dir emit `_intro.md` **first**
  (special-cased by name, **not** byte sort -- F3) then the tag files
  alphabetically. Yields an ordered list of `{ path, demote }` where
  `demote = 1` for an `_intro.md` and `demote = 2` for a tag file.
- A coverage-lint invariant (F3): every tag filename is lowercase-leading
  (matches the existing `#([a-z]...)` tag grammar in `scanTags`).
- `demoteHeadings(markdown, by)` generalizes the current fixed one-level shift to
  `by` levels (clamp at h6, fences untouched). Each module is demoted by its
  `demote`.
- **Why this is zero-diff (replaces the F2 reconciliation):** today every
  source file is one module demoted by 1, so a file h1 -> h2 (group) and its
  `## #tag` -> h3 (rule). After the split, the group `_intro.md` keeps that h1
  **verbatim** and is demoted by 1 (-> h2); each tag file is authored at h1 and
  demoted by 2 (-> h3). Same three levels (root h1, group h2, rule h3) for every
  case:
  - `backend` (leaf, source h1 `# Back-end instructions` == bundle title):
    `_intro` h1 -> h2 reproduces today's demoted-h2; the redundant title-then-h2
    is **preserved**, not removed -> zero diff.
  - `authoring` (leaf, no source h1): `_intro` is prose-only (no heading); the
    tag file (authored h1) demotes by 2 -> h3, matching today's
    `## #ai-instruction-review` -> h3, with no intervening h2 (as today).
  - `frontend` (branch): `front/` and `ui-guidelines/` `_intro` h1s -> h2; tags
    -> h3. `front.md`'s h1 also equals the bundle title; preserved -> zero diff.
  - `core` (inlined, `main.md` is h1 root): group `_intro` h1 -> h2; tags -> h3.
- Lints (`scanTags`, `ownershipCoverage`, `danglingTags`, `coreToBundleRefs`)
  are text-based and unchanged. No tag is defined in an `_intro.md` (it carries
  the group heading + prose, never a `#tag`); a group with a heading-less
  `_intro.md` (authoring) is allowed.

### 1.2 Migration (one-time script)

- Split each existing multi-rule file: every `## #tag ...` section ->
  `<group>/<tag>.md` (group = source basename per 1's routing) with the heading
  promoted h2 -> h1; the file's content **above the first `## #tag`** (its h1, if
  any, + intro prose) -> the group's `_intro.md`, **verbatim** (nothing dropped
  or rewritten).
- `manifest.json` **bundle `sections` entries (`name`, `title`, `when`) are left
  byte-for-byte untouched** (F5), so hrefs (`.agentsmith/agents/<name>.md`) and
  the `onDemandIndex` lines are trivially identical. No `modules` pin is used --
  within-group order is alphabetical after the reorder pre-step.
- **Source preparation (one-time, reviewed, BEFORE the split) (F20, F4):** two
  ordering/whitespace-only commits on the *current* multi-rule files, each
  reviewed on its own `--stdout` diff:
  1. **Reorder (F20):** sort the `## #tag` sections within each file into
     alphabetical (= filename) order, so the alphabetical resolver reproduces
     them post-split. Content-identical; the diff is pure reordering. Today's
     within-group order is authored and non-alphabetical in `ai`, `git`, `swe`,
     `front`, `ui-guidelines` (verified); `code`, `backend` are already sorted.
  2. **Normalize whitespace (F4):** see below.
  The split's gate (1.3) then compares against this prepared tree, so the split
  itself is zero-diff.
- **Pre-normalization (F4, F13):** `generate()` `trim()`s **each module block**
  then joins with `\n\n`. Today a whole section file is one block, so blank
  lines interior to it survive verbatim and only the file's outer edges are
  trimmed; after the split each `## #tag` section is its own block, trimmed in
  isolation. For strict equality the normalization (a separate, reviewed commit)
  must make every section **already** satisfy: no leading/trailing blank line
  within its own span, and exactly one blank line at each section boundary -- so
  that extracting a section and `trim()`-ing it is byte-identical to its slice in
  today's joined output. The test states this as the invariant, not just
  "single blank line between sections."

### 1.3 Acceptance gate (the safety proof)

The gate is a **strict, empty-diff** comparison: capture `node bin/cli.js
--stdout` and `--full` **and** every bundle file. The **pre** side is
`generate()` over the **prepared old tree** (after the reorder + normalize
pre-steps of 1.2, each reviewed on its own diff in isolation); the **post** side
is the migrated new tree. Because the rules are pre-sorted to alphabetical,
`_intro.md` preserves each source h1 verbatim, and demotion is role-based (1.1),
the migration diff MUST be **empty** -- no enumerated exceptions, no approved
removals. The empty byte-diff inherently proves emission order == alphabetical
(F22), so no separate order assertion is needed. Plus: the defined tag set is
unchanged, `ownershipCoverage` is clean, `node --test` green. Delete the old
multi-rule files once the gate passes.

### 1.4 Phase 1 done-criteria

Reorder + normalize pre-steps committed (each a reviewed, content-preserving
diff); empty **migration** diff (over `--stdout`, `--full`, every bundle); green
suite; ownership lint clean; old files removed.

**Interim apply path (F12).** Phase 1 ships before Phase 2. During the interim,
`/instruction-review` emits per-tag `targetFile`s and the **existing**
agent-guided ensure-end-state apply still works unchanged: a per-tag file's whole
body **is** the rule, so the apply does a whole-file replace -- no `## #tag`
regex section-capture is involved. No window exists where the committed worksheet
references a file neither old nor new apply can resolve.

## Phase 2 -- triage workflow v2

### 2.1 Schema (`devtools/triage-ui/schema.mjs`)

- `decision.details`: required for `reject`/`fold`/`defer`/`refine`; **forbidden
  for `adopt`/`park`** (validateEntry reports a problem if present).
- Add optional `lastRoundReply` -- the agent's reply to the current refine
  `details`. Validation (F11): when present it MUST be a string; empty string
  allowed; single field, overwritten on a new reply (no thread history --
  accepted trade-off).
- **Remove `current`** from the schema: `strengthen` requires only `draft`; the
  diff source is the live rule file. `new-rule` unchanged (no current). A
  present `current` is ignored -- no longer part of the contract; the migrator
  and `/instruction-review` emit stop writing it.
- `targetFile` = the per-tag rule file path (e.g.
  `instructions/core/git/git-title.md`).

### 2.1.1 Worksheet migration (F7, runs before v2 validation is enforced)

Forbidding `details` on `adopt`/`park` and dropping `current` would make any
existing worksheet (and the live `triage.json`) fail v2 validation, and the
server's PUT rejects on any schema problem -> the worksheet becomes
un-saveable. So the v2 bump ships a one-time, idempotent worksheet migration:
strip `current` from every entry, strip `details` from `adopt`/`park` decisions,
leave everything else.

**It is applied in-memory on read, never as a boot-time disk write (F16).**
Both read paths route through **one migrate-then-tokenize helper**: `readTriage`
(serves the migrated object) **and** `currentToken` (the PUT's stale-version
comparison, server.mjs:51-54) tokenize the **migrated** form, not the raw disk
text. So the version an open tab holds (migrated-form token from its GET) equals
the token the next PUT compares against -- no spurious `409` on the first
autosave. The on-disk `triage.json` is rewritten only by the next genuine PUT
(or an apply splice), so starting the server never dirties the working tree
(which would otherwise trip the F9 preflight). A CLI form is offered for an
explicit on-disk migration. Tests: (a) a pre-v2 worksheet (with `current` + an
adopt-note) read through `readTriage` validates clean without the file changing
on disk; (b) the GET-served token equals the token `currentToken` yields for the
same pre-v2 file, so the first autosave does not 409.

### 2.2 Apply engine (`devtools/triage-ui/apply.mjs`, committed, shared)

- Exports `apply({ triagePath, root, runTests })` returning the report
  (adopted/rejected/folded/deferred/refined/parked/failed). Plus a CLI entry.
- Validate (validateFile + validateCrossRefs) once; malformed -> report + skip.
- Per entry by `decision.verdict`:
  - `adopt` (status ready): **write/create the rule file = `draft`**;
    `new-rule` also ensures the `ownership.yaml` row. Regenerate + `node --test`
    gate (run as a **child process** with a timeout, 2.3); per-entry snapshot
    recovery; on failure -> `decision={verdict:'park'}` + push to `applyLog`.
  - `reject`/`fold`/`defer`: ensure the decisions-log line in canonical grammar.
  - `refine`: leave; surface with `details` + `lastRoundReply`.
  - `park`: leave.
  - On each terminal success: splice the entry, atomic canonical rewrite.
- **`rehome`/`reowner` are deferred (F10, YAGNI):** no current worksheet entry
  uses them. `apply()` treats them as **unsupported** -- left untouched and
  reported under a `skipped` bucket, not silently parked -- until a concrete need
  lands them in a follow-up.
- `/instruction-apply` skill becomes thin: validate -> `apply()` -> report. The
  hand-edit step (the weak link this session) is gone; apply is deterministic.

### 2.3 Server + UI (`devtools/triage-ui/`)

- **Live-rule transport (F6):** add `GET /api/rule?targetFile=<path>` returning
  the live file text (or `{exists:false}` for a `new-rule` target). The handler
  **guards path traversal**: resolve under the repo and require the path to stay
  within `instructions/`; reject otherwise. App.js read sites (F15): there is one
  behavioral site -- `renderDiff`'s `lineDiff(entry.current||'', …)` (app.js:87);
  the `current -> draft` label (app.js:164) is cosmetic. Because `renderDiff`
  re-runs on every `draft` keystroke (app.js:120), the live text is **fetched
  once per selected entry** (in `renderDetail`/`load`) and cached on the entry/
  closure -- never re-fetched inside `renderDiff`.
- **`POST /api/apply`:**
  - **Clean-base preflight (F9), concretely:** run `git status --porcelain` over
    `instructions/` and `instructions/ownership.yaml`; if non-empty, **refuse**
    and return the dirty paths (no "unrelated" fuzz -- any uncommitted change
    there blocks). No-op when no entry is `adopt`.
  - **Concurrency (F8):** an in-process apply **lock**. While apply runs, the
    server rejects `PUT /api/triage` (autosave) with **`423 Locked`** (a status
    distinct from the stale-version `409`, F17) carrying `{error:'applying'}`;
    the client branches on `423` to surface "applying…" and **retry** (not the
    `409` reload path at app.js:59, which would race the in-flight rewrite). The
    `node --test` gate runs in a **child process** (F18) with `cwd` = repo root
    (as the existing `execSync('node bin/cli.js')` does), running the full suite,
    with a configurable timeout; a timeout is treated as a gate failure
    (snapshot restore -> park + applyLog) and **reported distinctly** from a
    genuine test failure.
  - On completion the response carries the report **and the new worksheet
    version**; the UI re-renders from the response (version handshake), no stale
    PUT.
- Header **Apply** button: confirm dialog listing what will apply -> POST ->
  render report -> reload from the response.
- Refine entry: render `details` (human question) + `lastRoundReply` (agent
  answer) as a panel; the human edits `details` in the UI. Verdict note input
  hidden for `adopt`/`park`.

### 2.4 Tests + export

- Unit: depth-aware resolver/demotion; migration strict-diff (1.3); worksheet
  migration (2.1.1) round-trips + validates; `apply.mjs` (adopt write/create,
  new-rule + ownership row, reject log line, splice, per-entry recovery,
  child-process test-gate timeout, rehome/reowner -> skipped); schema v2 (details
  required/forbidden matrix, `lastRoundReply` string-or-absent, no `current`);
  `GET /api/rule` path-traversal guard; `POST /api/apply` lock vs PUT. The export
  test still proves `devtools/` is neither installed nor published.

## Out of scope

- Changing instruction **content** (this is a storage + workflow change).
- The `/instruction-review` emit beyond pointing `targetFile` at per-tag files
  and dropping `current` (it already emits JSON directly).
- Multi-turn refine thread history (single `lastRoundReply` by decision).
- Any change to `ownership.yaml` / `roles.yaml` semantics.
- `rehome`/`reowner` apply (deferred, 2.2) -- `apply()` reports them `skipped`.

## Risks

- **Migration perturbs output.** Mitigated by the strict-diff gate (1.3) over
  `--stdout`, `--full`, and every bundle file, after the separately-committed
  reorder + normalize pre-steps; the only tolerated **migration** diff is
  **empty** (the redundant title-then-group-heading is preserved verbatim, not
  deduped). A divergence means the migration script is wrong, not the gate.
- **Apply blocking the server.** Mitigated by the apply lock + child-process
  test-gate with timeout (2.3); autosave PUTs are refused with `423 Locked`
  (distinct from the stale-version `409`) for the apply window, not silently
  interleaved.
- **File count** (~40 files). Accepted; dir-grouped and navigable.
```
