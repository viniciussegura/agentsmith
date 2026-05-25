# On-demand instruction bundles

## Problem

`agentsmith` inlines every instruction module into one `AGENTS.md`.
An agent loads the whole file at session start, paying for rules it may never use.
Front-end rules (`front.md`, `ui-guidelines.md`) are roughly 27% of the document yet irrelevant to a backend-only task.

We want the generated instructions split so an agent loads a lean core every session and pulls a domain bundle only when the task calls for it.
The split is fixed at generation time; the loading decision is made by the agent at runtime, given the task's context.
The same artifacts ship to every consumer -- there is no per-consumer configuration.

## Goals

- A lean `AGENTS.md` core plus separately-emitted domain bundles.
- An on-demand index in the core that tells the agent, in imperative terms, which bundle to read for which kind of work.
- Keep the full monolithic output available behind a flag for consumers that want it.
- Keep generation deterministic and the core logic pure and unit-testable.

## Non-goals

- Per-consumer manifest variants or profiles.
- Runtime detection of project type by the generator.
- Automatic editing of a consumer-owned root `AGENTS.md` beyond an optional first-time stub.

## CLI

Two orthogonal axes, each with a default and an opt-out.

**Layout** -- what the core contains.

- `--lean` (default): core = preamble + core `modules` + on-demand index; each bundle emitted as its own file.
- `--full` (alias `--inline`): single monolith = preamble + core `modules` + every bundle's modules, in manifest order; no index, no bundle files.

**Placement** -- where the generated core is written.

- `--nested` (default): generated core -> `.agentsmith/AGENTS.md`; root `./AGENTS.md` is left to the consumer (see Root stub).
- `--root`: generated core -> `./AGENTS.md` (overwrites).

Resulting combinations:

```
default (lean+nested)  ->  .agentsmith/AGENTS.md (lean) + .agentsmith/agents/*.md ; root stub if absent
--root (lean+root)     ->  ./AGENTS.md (lean) + .agentsmith/agents/*.md
--full (full+nested)   ->  .agentsmith/AGENTS.md (monolith) ; root stub if absent ; no bundles
--full --root          ->  ./AGENTS.md (monolith) ; equals today's output byte-for-byte
```

`--stdout` is preview-only: it writes the core document to stdout and performs no disk writes (no bundles, no stub).
`--out <name>` overrides the core file path; it takes precedence over `--nested`/`--root`.

## Manifest schema

```json
{
  "source": "https://github.com/viniciussegura/agentsmith",
  "preamble": "instructions/main.md",
  "modules": [
    "instructions/ai.md",
    "instructions/code.md",
    "instructions/git.md",
    "instructions/swe.md"
  ],
  "bundles": [
    {
      "name": "frontend",
      "title": "Front-end instructions",
      "when": "Front-end or UI work",
      "modules": ["instructions/front.md", "instructions/ui-guidelines.md"]
    }
  ],
  "output": "AGENTS.md"
}
```

- `modules` are the always-loaded core.
- Each bundle: `name` (file stem, kebab-case), `title` (h1 of the bundle file; falls back to `name`), `when` (human trigger shown in the index), `modules` (members, emitted in order).
- `--full` flattens `modules` followed by each bundle's `modules` in array order, preserving the current emit order exactly.

## Generation

`generate()` stays pure and keeps its current signature and monolith behavior.
It is reused for three jobs: the full-layout core, the lean core (with the index passed in as a trailing module), and each bundle file (with the bundle `title` passed in as the preamble).
Heading demotion already implemented in `generate()` applies uniformly, so every emitted file has a single h1.

New pure helpers in `src/`:

- `onDemandIndex(entries)` -> markdown string.
  Input is a list of `{ when, href }`.
  Output is authored at h1 + h2 so `generate()`'s demotion lands it at h2 + h3, consistent with module sections:

  ```markdown
  # On-demand instructions

  ## #on-demand Load when relevant

  You **MUST** read the matching file in full before starting work in its area.

  - Front-end or UI work -> `agents/frontend.md`
  ```

- `danglingTags({ coreText, bundleTexts })` -> array of tag names referenced but never defined across the union.
  A definition is a heading line matching `#{1,6}\s+#<tag>\b`; a reference is any `#<tag>` token outside fenced code.
  Returned to the caller, which warns on stderr; non-fatal.

### Index href resolution

The href is relative to the directory holding the core file.

- Core at `.agentsmith/AGENTS.md` (nested): bundle href is `agents/<name>.md`.
- Core at `./AGENTS.md` (root): bundle href is `.agentsmith/agents/<name>.md`.

`bin/cli.js` computes hrefs per the active placement and feeds them to `onDemandIndex()`.

### Bundle file

`generate({ preamble: "# " + (title || name), modules: bundleModules, source, commit, date })`.
Result is a do-not-edit header, the bundle title as the sole h1, and member sections demoted beneath it.
Written to `.agentsmith/agents/<name>.md` regardless of placement axis.

## bin/cli.js orchestration

1. Parse flags: layout (lean default), placement (nested default), `--stdout`, `--out`.
2. Read manifest; resolve `source`, `commit`, `date` via existing `sourceRevision()`.
3. Build:
   - full: core = `generate()` over `modules` + flattened bundle modules; no bundles, no index.
   - lean: compute hrefs; `index = onDemandIndex(...)`; core = `generate()` over `modules` + `[index]`; build each bundle doc.
4. Run `danglingTags()` over the union; warn on stderr if any.
5. Write:
   - `--stdout`: core to stdout; stop (no disk writes).
   - else: `mkdir -p` the core directory; write core. In lean, `mkdir -p .agentsmith/agents` and write each bundle. In nested, write the root stub only if `./AGENTS.md` is absent.

### Root stub (nested, only when root AGENTS.md absent)

```markdown
<!-- Consumer-owned. agentsmith generates .agentsmith/AGENTS.md; reference or extend it here. -->

See `.agentsmith/AGENTS.md` for generated agent instructions.
```

Never overwrite an existing root `AGENTS.md`.

## Repository hygiene

agentsmith's own repo gitignores the generated `AGENTS.md`.
Add `.agentsmith/` to `.gitignore` so dogfooding runs do not dirty the tree.

## Testing

Pure helpers via `node --test`:

- `onDemandIndex`: contains an h1, the `#on-demand` tag, the literal `MUST`, and one bullet per entry pairing `when` with `href`.
- `danglingTags`: returns a referenced-but-undefined tag; returns empty when every reference resolves; ignores tokens inside fenced code.
- bundle doc: exactly one h1 (the title); member headings demoted one level.
- lean core: includes core-module content and the index; excludes bundle-module content.
- `--full --root` equivalence: monolith matches a `generate()` call over all modules in current order (guards against regression of today's output).

cli-level placement, `mkdir`, and stub behavior are kept thin; cover with one integration test that generates into a temp dir and asserts the file tree and that an existing root `AGENTS.md` is preserved.

## Risks

- **Agent skips a bundle it should load.** Inlining guarantees a rule is seen; on-demand trades that for tokens. Mitigated by imperative `MUST` wording and crisp `when` triggers, not eliminated.
- **Dangling cross-refs.** Splitting can orphan a `#tag` reference whose definition moved to a bundle. The `danglingTags` warning surfaces this; it does not block generation.

## Scope

One logical unit of work on the `refine-instructions` branch.
