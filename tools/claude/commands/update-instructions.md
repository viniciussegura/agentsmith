---
description: Generate or refresh this project's agentsmith instruction set (instructions only -- tools come from the plugin). Plugin-only command.
---

Run the agentsmith generator to (re)write this project's instruction files — the instruction set only, never the tool adapters (`--no-tools`).
Tools come from the agentsmith plugin; this command exists because the plugin is already installed, so it lays down or refreshes the instructions without touching (or duplicating) tooling.

**Requires** Node + `npx` on PATH and GitHub reachability (agentsmith ships from GitHub, not the npm registry), or a local clone of the agentsmith repo.
If `npx` is unavailable or GitHub is unreachable, STOP and report this exact requirement plus the manual alternative below — do not partially write.

1. Ask the user: project scope (this repo) or `--scope user` (home-global)?
2. Run the generator (instructions only, no tool adapters):
   - project: `npx -y github:viniciussegura/agentsmith install --no-tools`
   - user-global: `npx -y github:viniciussegura/agentsmith install --scope user --no-tools`

   Local-clone fallback when `npx` is unavailable: from a checkout of the agentsmith repo, `node bin/cli.js install --no-tools` (project) or `node bin/cli.js install --scope user --no-tools`.
3. Report what was written (the generated `AGENTS.md` + on-demand bundles, and for `--scope user` the `~/.claude/CLAUDE.md` import block).

Instructions always come from the generator — AI-neutral and project-tailored. This command never injects frozen instruction text.
