---
description: Remove the agentsmith instruction set this project generated (leaves the plugin's tools intact). Plugin-only command.
---

Remove the generated agentsmith instruction files from this project — the reverse of `/agentsmith:update-instructions`.
Tools installed by the plugin are untouched (they live in the plugin cache, not the project); this clears only what the generator wrote: `AGENTS.md`, the `.agentsmith/` bundles, the install manifest, and — for `--scope user` — the `~/.claude/CLAUDE.md` import block.
Run it before disabling or removing the plugin if you want the project left clean (the plugin cannot clean up the instructions itself).

**Requires** Node + `npx` on PATH and GitHub reachability (agentsmith ships from GitHub, not the npm registry), or a local clone of the agentsmith repo.
If `npx` is unavailable or GitHub is unreachable, STOP and report this exact requirement plus the manual alternative below — do not partially remove.

1. Ask the user: project scope (this repo) or `--scope user` (home-global)? Match the scope the instructions were installed under.
2. Run the uninstall (`--yes` so it proceeds non-interactively; it is destructive and prints its plan first):
   - project: `npx -y github:viniciussegura/agentsmith uninstall --yes`
   - user-global: `npx -y github:viniciussegura/agentsmith uninstall --scope user --yes`

   Local-clone fallback when `npx` is unavailable: from a checkout of the agentsmith repo, `node bin/cli.js uninstall --yes` (project) or `node bin/cli.js uninstall --scope user --yes`.
3. Report what was removed.
