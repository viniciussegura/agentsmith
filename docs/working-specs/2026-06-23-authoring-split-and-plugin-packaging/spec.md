# Spec: Authoring-tool split + Claude plugin packaging

Date: 2026-06-23
Status: Reviewed -- ready for plan (spec-review converged at round 3, b=0). Plan gated on confirming plugin assumptions A1-A4.

## Motivation

`npx agentsmith` (project scope) and `npx agentsmith --user` install **every** file under `tools/claude/**` into the consumer's `.claude/**` ([src/tools.js](../../../src/tools.js), [bin/cli.js:163-171](../../../bin/cli.js)). Two problems surfaced when installing on a fresh machine:

1. **Authoring tools ship to consumers that cannot run them.** `instruction-review` / `instruction-apply` audit and edit *this repo's* instruction **source** -- they run `node bin/cli.js --stdout`, lint `instructions/ownership.yaml`, and write into `instructions/` ([instruction-review SKILL.md:9-10](../../../tools/claude/skills/instruction-review/SKILL.md)). A consumer install ships only the **generated** `AGENTS.md`, never the `instructions/` source tree or `bin/cli.js`, so these tools cannot function in any consumer project -- project scope **or** `--user`. They are dev tooling for the agentsmith repo, mis-shipped as product.
2. **No namespace, no managed updates.** Tools land as bare files in the shared `~/.claude/{skills,commands,agents}/`. Generic names (`review-swe`, `review-db`, `/review-board`, `/spec-review`) can collide with the user's own or another plugin's, reinstalls clobber silently, and there is no version-aware update channel -- the user must remember to re-run `npx`.

This spec does two orthogonal things: **(Q1)** stop shipping the authoring-only tools to consumers while keeping them working in this repo, and **(Q2)** add a Claude Code **plugin** packaging of the shippable tool set for namespacing + managed updates, without disturbing the existing npx path or the AI-neutral instruction generator.

## Goals

- **Q1.** A consumer install (`npx agentsmith` and `npx agentsmith --user`) installs only tools that function in a consumer project. The authoring-only tools no longer appear in a consumer's `.claude/`.
- **Q1.** The authoring tools keep working in *this* repo (the agentsmith checkout), installed by an explicit dev step.
- **Q2.** The shippable tool set is installable as a Claude Code plugin from this repo as a marketplace, giving an `agentsmith:` namespace, enable/disable/uninstall, and version-aware updates.
- **Q2.** The instruction set stays delivered by the generator (npx), not the plugin; a plugin user lays instructions down via a shipped `/agentsmith-init` command that calls the generator. No double-source of instruction text.
- The npx raw-install path keeps working byte-for-byte for anyone not adopting the plugin.

## Non-goals

- **Multi-AI plugins.** Only `tools/claude/` exists; this spec packages the Claude branch. Gemini/Codex packaging stays future work ([docs/future-work/2026-06-02-non-claude-user-wiring.md](../../../docs/future-work/2026-06-02-non-claude-user-wiring.md)).
- **Instructions inside the plugin.** No SessionStart-injection of `AGENTS.md`; that would forfeit the generator's per-project tailoring (lean/full layout, on-demand bundles) and AI-neutrality. Instructions remain file-based via the generator.
- **Auto-publishing the marketplace** (CI release, version bumping automation). The version is bumped by hand in `package.json` as today.
- **Migrating existing consumers' already-installed authoring tools.** A consumer who previously ran the old npx still has stale `instruction-review` files in their `.claude/`; we do not reach in to delete them (logged as a migration note).

## Behavior

### Part Q1 -- authoring/shippable split

**`devtools/` already exists** and is this repo's maintainer-only dev infrastructure: `devtools/triage-ui/` (the `apply.mjs` + `schema.mjs` the authoring tools call -- e.g. `/instruction-apply` runs `node devtools/triage-ui/apply.mjs`) and `devtools/restructure/`. Those are **node scripts run via `npm`/`node`**, never installed as adapters. This spec adds a **new sibling subtree, `devtools/claude/`**, as a second *adapter source root* for the authoring slash-tools. The two meanings coexist under `devtools/`: `devtools/{triage-ui,restructure}` = runtime scripts; `devtools/claude/` = the Claude adapter files those tools surface. The adapter scan targets **`devtools/claude` exactly** -- never `devtools/` wholesale -- so `triage-ui`/`restructure` are never mistaken for adapters.

So there are two adapter source roots; both map `<root>/claude/<rest>` -> `.claude/<rest>`, differing only in **when** they install:

- `tools/claude/` -- **shippable.** Installed in every scope: project, `--user`, and dev.
- `devtools/claude/` -- **authoring-only.** Installed **only** under a new `--dev` flag (used by this repo's dogfood). Never installed for a consumer.

Files relocated `tools/claude/` -> `devtools/claude/` (git move, history preserved):

| Path under the AI root | Kind |
|---|---|
| `skills/instruction-review/SKILL.md` | skill |
| `skills/instruction-review/proposal-format.md` | skill asset |
| `commands/instruction-review.md` | command |
| `commands/instruction-apply.md` | command |
| `agents/instruction-editor.md` | agent (reduce) |
| `agents/review-ai.md` | agent (instruction-review-only lens) |
| `agents/review-git.md` | agent (instruction-review-only lens) |

Everything else stays in `tools/claude/` and ships: `instruction-check` (skill + command), `review-board` (skill + command + `lint.mjs` + `reviewer-common.md` + the shared `review-*` lenses + `review-pm` + `review-verifier` + `review-correctness`), `review-promote` (command), `spec-review` (skill + `spec-specialist` agent), and the `require-explicit-model.mjs` hook.

**Cross-root dependency (intentional).** The reviewer protocol is **supplied at runtime by the orchestrating skill's spawn prompt** -- the "the spawn prompt provides it" clause in each lens's Protocol section -- not loaded by the agents from a fixed path. (The `.claude/skills/instruction-review/...reviewer-common.md` path-text in `review-ai`/`review-git` is an inert pointer that resolves to nothing on disk -- no `reviewer-common.md` lives under `instruction-review/`; the physical `reviewer-common.md` is `tools/claude/skills/review-board/reviewer-common.md`. This dangling path-text is a **pre-existing** repo condition, unchanged by and out of scope for this spec.) The only **runtime** file dependency the moved tools carry is `instruction-review`/`instruction-apply` calling `devtools/triage-ui/{apply,schema}.mjs` (already in `devtools/`). Because the move is a mechanical `git mv` that preserves the exact install **dest** (`.claude/skills/instruction-review/`), whatever the orchestrator supplied pre-move it supplies post-move -- runtime resolution is byte-identical. Under `--dev`, `tools/claude/` + `devtools/claude/` both install and the checkout has `devtools/triage-ui/`, so nothing dangles that did not already dangle. The dependency is one-directional authoring -> shipped; nothing **shipped** depends on a moved file at runtime (the only shipped textual mentions of the moved set are inert -- see below).

CLI flag surface:

- New `--dev` flag. When set, the adapter step installs **both** `tools/claude/` and `devtools/claude/`. Without it, only `tools/claude/`. `--dev` is independent of scope: `--dev` alone is a project-scope dev install of this repo; `--user --dev` installs both roots to home (defined, though the dogfood case is the project-scope `--dev`).
- `--dev` has **no effect under `--stdout`** -- that branch writes core instructions to stdout and runs no adapter step at all. The only meaningful combinations are `--dev` (project) and `--user --dev`.
- This repo's dogfood install becomes `node bin/cli.js --dev`. Because `.claude/` is **gitignored** (verified: `git ls-files .claude` is empty -- it is throwaway install output, not tracked), the move orphans **no tracked file**. The install **dest paths are unchanged** by the move (`devtools/claude/skills/instruction-review/` -> `.claude/skills/instruction-review/`, the same dest the old `tools/claude/...` produced), so a `--dev` reinstall overwrites in place. A maintainer who previously ran a non-`--dev` install should `rm -rf .claude` once before the first post-move `--dev` install to drop any stale local copy; nothing in version control is affected.

Rationale for a **separate root** over a manifest skip-list: the physical boundary serves both consumers (the installer never reads `devtools/claude` without `--dev`) **and** the plugin build (Part Q2 enumerates `tools/claude/` only, so authoring tools are excluded for free -- no second filter to keep in sync).

**Shipped textual references to the moved set (all inert).** Two kinds of shipped text name the moved tools, neither a runtime dependency:
1. **Commented config.** `review-board/SKILL.md` carries a **commented** example line `#   participants: [swe, security, db, qa, docs, frontend, ux, ai, git]` and `issue-format.md` mentions `instruction-review.participants` -- documentation of an *optional config key*, never a live spawn (a code-review round never instantiates `ai`/`git`).
2. **Agent description prose.** Eight shipped lens agents (`review-db/-frontend/-docs/-qa/-ux/-security/-swe/-verifier.md`) carry a `description:` line reading "Used by the review-board **and instruction-review** skills" -- prose metadata, not a spawn or a path.

Both stay as-is. They are out of scope for the half-move guard, which targets **invocation syntax** (slash-command tokens, agent spawn-target ids), **not** prose `description:` text or commented examples (Tests defines the exact scope and the allowlist).

### Part Q2 -- Claude plugin packaging

`tools/claude/` is already shaped like a plugin's convention dirs (`skills/`, `commands/`, `agents/`, `hooks/`). Packaging adds committed manifests and one new command; it moves no tool content.

**Distribution channel: the git repo, not npm.** The plugin is consumed by adding this GitHub repo as a marketplace (`/plugin marketplace add viniciussegura/agentsmith`), so Claude Code reads the manifests from a git checkout at the chosen ref. It is **not** delivered through the npm tarball; therefore the root `.claude-plugin/marketplace.json` does **not** need to be added to `package.json` `files` (which stays scoped to the npx generator's `bin/`, `src/`, `instructions/`, `tools/`, `manifest.json`). The npx path and the plugin path are independent channels reading the same repo. Note one asymmetry: `tools/claude/.claude-plugin/plugin.json` (component 1) lives **under** `tools/`, so it **does** ride along in the npm tarball -- harmless and inert for npx consumers (it is never read outside a plugin context), unlike the root `marketplace.json` which stays out of the tarball.

> **ASSUMPTIONS (unverified Claude Code plugin-runtime behavior -- gating the plan, see Verification).** The following are taken from how plugins are believed to work and **must be confirmed against the current Claude Code plugin docs before this spec becomes a plan**. Each is an assumption, not an established fact:
> - **A1.** A plugin's `skills/`, `commands/`, `agents/` convention dirs are **auto-discovered** (the manifest need not enumerate them).
> - **A2.** A plugin can **declare a PreToolUse hook** (via a `hooks` field in `plugin.json` or a `hooks/hooks.json`), with the script path resolved through a plugin-root path variable the runtime provides.
> - **A3.** `marketplace.json` at repo root may point at a plugin in a **subdirectory** via a relative `source` (`./tools/claude`), resolved relative to the repo root at marketplace-add time.
> - **A4.** Installed plugin tools are surfaced under an `agentsmith:` namespace.
>
> **Fallback decision branch (resolve in the plan once A1-A4 are checked):** if **A2** is false (a plugin cannot declare the hook), the plugin ships **skills/commands/agents only** and the `require-explicit-model.mjs` hook continues to be wired by the npx `settings.json` merge; the README then states the hook requires the npx install even for plugin users. This changes the plugin's value (namespacing + managed updates for slash-tools, but not a self-contained hook) and must be decided explicitly, not silently.

Components (assuming A1-A4 hold; the plan adjusts per the fallback):

1. **`tools/claude/.claude-plugin/plugin.json`** -- carries exactly `name: "agentsmith"`, `version` (mirrored from `package.json`), `description` (mirrored from `package.json`), and (per A2) a static `hooks` declaration for the PreToolUse `Agent` hook pointing at `hooks/agentsmith/require-explicit-model.mjs` via the plugin-root variable. It does **not** enumerate skills/commands/agents (per A1). These are the only bytes it contains -- a fixed shape plus three values sourced from `package.json`.
2. **`.claude-plugin/marketplace.json`** (repo root) -- lists one plugin, `agentsmith`, `source: "./tools/claude"` (per A3).
3. **`/agentsmith-init` command** (`tools/claude/commands/agentsmith-init.md`, shippable) -- lays the instruction set down in the user's current project by invoking the generator. (User-facing token is namespace-dependent under A4: it may surface as `/agentsmith:agentsmith-init` rather than bare `/agentsmith-init`; pin the exact form when A4 is confirmed.) **Hard dependency:** it requires **Node + `npx` on PATH and npm-registry reachability** (or a local checkout of this repo), because it shells to `npx agentsmith [--user]`. The command doc states this dependency up front and defines the failure path: if `npx` is absent or the registry is unreachable, it reports a clear error naming the requirement and the manual alternative (`git clone` + `node bin/cli.js`), rather than failing silently. This is the **deliberate** coupling that keeps instructions file-based and AI-neutral (the generator, not frozen plugin text) -- the plugin owns *tooling*; instructions always come from the generator, on **either** path.
4. **Generation + drift guard.** A new `npm run build:plugin` (`bin/build-plugin.js`) emits both manifests. Because the manifest enumerates nothing dir-derived (A1), the generator's only inputs are `package.json`'s `name`/`version`/`description` plus the two fixed-shape templates (including the static hook block). It does **not** scan `tools/claude/` -- adding/renaming a tool dir does not change the manifests (auto-discovery handles it), so there is no dir-scan drift to guard. The guard is therefore narrow and well-defined: a test asserts (a) the committed `plugin.json`/`marketplace.json` are byte-equal to the generator's output, and (b) `plugin.json.version === package.json.version` and `plugin.json.description === package.json.description`. The common trigger is a hand version bump in `package.json`; the test fails until `build:plugin` is re-run and the manifests committed.

Distribution model (documented):

- **npx (today):** `npx agentsmith [--user]` installs instructions + tools + hook (via [src/settings.js](../../../src/settings.js) merge). Unchanged except the Q1 exclusion.
- **plugin (new):** `/plugin marketplace add viniciussegura/agentsmith` then `/plugin install agentsmith` installs the slash-tools (and, per A2, the hook). Instructions come from `/agentsmith-init`, which itself calls the generator.

For **tooling**, a user picks **one** path: running both wires the hook twice. The two firings are *expected* idempotent (each invocation independently checks for `model` and exits identically), but that expectation is **unconfirmed until A2's hook mechanism is verified** -- so it is logged as an accepted limitation (technical-debts), not relied upon, and the "pick one path for tooling" guidance is documented (not enforced).

## Edge cases

- **Stale authoring tools in an existing consumer `.claude/`.** A consumer who ran the pre-split npx has `instruction-review`/`instruction-apply` files already on disk. The new npx does not write them, but the installer never deletes (it only writes its own files). They remain inert (they no-op without `instructions/`). Logged as a migration note; manual cleanup if the user cares.
- **`--dev` outside this repo.** `--dev` only adds `devtools/claude/` as a source; if a consumer runs it, they get the authoring tools, which still cannot function (no `instructions/`). `--dev` is documented as repo-maintainer-only; no guard blocks misuse (consistent with the existing flags' trust model).
- **`devtools/claude` scan boundary.** The adapter scan must point at `devtools/claude` exactly, not `devtools/`. If it scanned `devtools/` wholesale, `devtools/triage-ui/server.mjs` would feed the mapper and (under a naive `^(tools|devtools)/<ai>/<rest>` regex) mis-map to `.triage-ui/server.mjs`. The mapper additionally hard-excludes any `devtools/` second segment other than `claude` (see Implementation sketch), so the boundary is enforced in two places: the listing dir and the mapper regex. A test asserts a `devtools/triage-ui/...` path produces no install entry.
- **Hook double-wiring (npx + plugin together).** If a user installs tools via *both* paths, the `Agent` PreToolUse hook fires twice. The two firings are *expected* idempotent (each independently checks for `model` and exits 0/2 identically) -- but this rests on assumption **A2** (the plugin hook reuses the same `node require-explicit-model.mjs` semantics), unconfirmed until A2 is verified. Logged in technical-debts as an accepted limitation; the "pick one path for tooling" guidance avoids it. No test (it depends on the unverified plugin hook mechanism).
- **`marketplace.json` / `plugin.json` drift.** Adding/removing/renaming a tool dir under `tools/claude/` does **not** change the manifests -- they enumerate nothing dir-derived (A1), so auto-discovery absorbs it and there is no dir-scan drift. The only drift surface is `version`/`description` falling out of sync with `package.json` (typically a hand version bump without re-running `build:plugin`); the drift-guard test catches exactly that. See the Generation + drift guard component for the precise assertions.
- **Plugin manifest schema uncertainty.** Captured as the **ASSUMPTIONS A1-A4** block in Part Q2, with an explicit fallback branch if A2 (plugin-declared hook) is false. These are a **gating precondition** of the plan (Verification), not an implementation-time discovery -- the plan does not start until A1-A4 are confirmed and the fallback resolved.

## Implementation sketch

- **`src/tools.js`** -- change `planToolInstall`'s contract to be root-aware. Concrete form: match `^(?:tools\/([^/]+)|devtools\/(claude))\/(.+)$` -- i.e. under `tools/` any `<ai>` segment maps as today, but under `devtools/` **only** `claude` is recognized as an adapter ai (`devtools/triage-ui/...`, `devtools/restructure/...` match nothing and are dropped). This regex has **three** capture groups, not two: the mapper must **coalesce the two ai groups** (`const ai = m[1] ?? m[2]`) and use `m[3]` as rest -- the current `[, ai, rest]` destructure ([src/tools.js:17](../../../src/tools.js)) becomes `[, ai1, ai2, rest]` -> `.<ai>/<rest>`. The function stays pure and still ignores any path under neither root. (Alternative considered: an explicit `roots` parameter; rejected because hard-coding the `devtools/claude`-only rule in the regex makes the non-claude exclusion intrinsic to the mapper rather than dependent on caller discipline.)
- **`bin/cli.js`** --
  - Add `--dev` parsing alongside the existing flags.
  - `installAdapters` builds its source list from `listToolSources(join(pkgRoot,'tools'),'tools')` always, plus `listToolSources(join(pkgRoot,'devtools','claude'),'devtools/claude')` **only when `--dev`** -- note the second listing is rooted at `devtools/claude`, never `devtools/`, so `triage-ui`/`restructure` are never listed. The `relBase` argument is always passed **forward-slashed** (`'devtools/claude'`, a string literal -- not an OS-joined path), so the emitted source paths stay forward-slashed and the mapper regex anchors correctly on Windows (`listToolSources` joins with a literal `/`). Concatenate, then `planToolInstall`.
  - No change to scope branching. `--dev` composes with `--user` and the default project branch; it is a **no-op under `--stdout`** (that branch installs no adapters), so it is not added to the `--stdout` path.
- **File moves** -- `git mv` the seven authoring files from `tools/claude/...` to `devtools/claude/...` (history preserved). The move is purely mechanical: the install **dest** is unchanged (`.claude/skills/instruction-review/` etc.), so all runtime resolution (spawn-prompt-supplied protocol, the `devtools/triage-ui/{apply,schema}.mjs` calls) is byte-identical before and after. Cross-references needing no edit: the moved `instruction-review` skill <-> `/instruction-apply` (move together); the inert `reviewer-common.md` path-text in `review-ai`/`review-git` (pre-existing dangle, see Cross-root note); `instruction-apply`/`instruction-review` -> `devtools/triage-ui/{apply,schema}.mjs` (already in `devtools/`). Confirm the shipped `review-board/SKILL.md` + `issue-format.md` references to `ai`/`git` participants stay commented/inert (no edit needed).
- **`bin/build-plugin.js`** (new) -- read `package.json` for `name`/`version`/`description`; emit `tools/claude/.claude-plugin/plugin.json` (fixed shape + those three values + the static hook block per A2) and `.claude-plugin/marketplace.json` (fixed shape + `source: "./tools/claude"`). **No directory scan** (A1 -- nothing dir-derived in the manifests). Wire `npm run build:plugin` in `package.json` `scripts`.
- **`tools/claude/commands/agentsmith-init.md`** (new) -- a slash-command doc instructing the agent to run `npx agentsmith` (or `--user`) in the user's project; surfaces the scope choice **and** states the Node/`npx`/registry dependency + the clear-error failure path when `npx` is unavailable (per Part Q2.3).
- **Hook declaration** -- per A2, add the plugin hook config (`plugin.json` `hooks` field or `tools/claude/hooks/hooks.json`) pointing at the existing `hooks/agentsmith/require-explicit-model.mjs` via the runtime's plugin-root variable. If A2 is false, this step is dropped per the Part Q2 fallback.
- **`manifest.json`** -- no change required (it governs instruction sections, not tool adapters); note only that the existing `authoring` instruction *section* and the new `devtools/claude/` authoring *tools* are conceptually paired (authoring instructions load on-demand; authoring tools install only under `--dev`).

## Tests

- **`test/tools.test.js`** (extend) -- `planToolInstall` maps `devtools/claude/skills/x` -> `.claude/skills/x`; maps `tools/claude/...` as today; **produces no entry** for `devtools/triage-ui/server.mjs` or `devtools/restructure/gate.mjs` (non-`claude` second segment under `devtools/`); ignores a path under neither root. This pins the two-place boundary.
- **CLI (`test/cli.test.js`)** -- child-process the CLI into a temp dir:
  - default project install: `tools/claude/` tools present under `.claude/`; **none** of `instruction-review`/`instruction-apply`/`instruction-editor`/`review-ai`/`review-git` present; and `devtools/triage-ui` / `devtools/restructure` scripts are **not** installed anywhere under `.claude/`.
  - `--dev`: the seven authoring files **are** present under `.claude/`, alongside the shippable set; still no `triage-ui`/`restructure` under `.claude/`.
  - `--user` (no `--dev`): authoring files absent under `~/.claude/`.
- **Plugin manifests** -- assert the committed `tools/claude/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` are byte-equal to `build-plugin`'s output; and `plugin.json.version === package.json.version` and `plugin.json.description === package.json.description`. (Gated: written once A1/A3 confirm the manifest shape; if the shape changes under verification, the test's expected bytes change with it.)
- **Structural (half-move guard)** -- over all **shipped** files under `tools/claude/**`:
  - (a) Assert **no** reference to any path under `devtools/claude/`.
  - (b) Grep for the moved identifiers **as invocation syntax only** -- slash-command tokens `/instruction-review`, `/instruction-apply`, and agent spawn-target ids `review-ai`/`review-git`/`instruction-editor` (e.g. an `Agent`/Task `subagent_type:` or an explicit "spawn the X agent" use). **Exclude** YAML `description:` lines and commented (`#`-prefixed) lines from the grep -- those are inert prose/examples, not spawns. The bare token `instruction-review` appearing in the eight shipped lens `description:` lines and the commented `participants` example is therefore out of scope by construction.
  - Assert (b)'s only in-scope hits are an explicit allowlist (expected: none) -- any new in-scope hit fails. The test runs **post-move**: the sole in-repo spawn of `instruction-editor` lives in `instruction-review/SKILL.md`, which moves out of `tools/claude/`, so after the `git mv` the scanned shipped set contains no spawn of a moved agent and the empty-allowlist assertion holds. This catches a half-move (a real spawn of a moved agent from shipped code) that a path-only check would miss, without false-positiving on prose.

## Verification

**Gating precondition (before the plan is written).** Confirm assumptions **A1-A4** (Part Q2) against the current Claude Code plugin docs -- via the `claude-code-guide` agent or the official documentation -- and record the verified field names (hook declaration key, plugin-root path variable, marketplace `source` resolution, namespace form) in the plan. Resolve the **fallback branch**: if A2 is false, drop the plugin hook and keep the hook on the npx/`settings.json` path. Part Q1 (the authoring split) does **not** depend on A1-A4 and may proceed independently if the plugin verification stalls.

Then:

- `npm test` green.
- Manual npx (Q1): `node bin/cli.js` into a throwaway dir -> authoring tools absent, `triage-ui`/`restructure` absent; `node bin/cli.js --dev` -> the seven authoring tools present.
- Manual plugin (Q2, after gating): in a throwaway Claude Code project, `/plugin marketplace add <local path to this repo>`, `/plugin install agentsmith` -> tools namespaced `agentsmith:*`, the `Agent` hook fires (if A2 held), `/agentsmith-init` lays down instructions. On a box without `npx`, confirm `/agentsmith-init` reports the clear dependency error rather than failing silently.
- Manual update: bump `package.json` version, `npm run build:plugin`, commit, `/plugin marketplace update` in the test project -> the new version is offered.

## Docs drift

- **README** -- document the two distributions (npx vs plugin), the `--dev` flag (maintainer-only), the `agentsmith-init` flow, and the "pick one path for tooling" constraint. Update the `--user`/project sections to note the authoring tools are no longer shipped.
- **`docs/future-work/`** -- log multi-AI plugin packaging (Gemini/Codex) and marketplace auto-publish as deferred, per `#swe-future-work`.
- **`docs/technical-debts/`** -- log the non-automated stale-authoring-tool cleanup for pre-split consumers, and the unenforced hook double-wiring constraint, per `#swe-technical-debts`.
