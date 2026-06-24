---
description: Lay down (or refresh) the agentsmith instruction set in this project via the generator.
---

Run the agentsmith generator to write this project's instruction files.

**Requires** Node + `npx` on PATH and npm-registry reachability (or a local clone of the agentsmith repo). If `npx` is unavailable or the registry is unreachable, STOP and report this exact requirement plus the manual alternative below — do not partially write.

1. Ask the user: project scope (this repo) or `--user` (home-global)?
2. Run the generator:
   - project: `npx agentsmith`
   - user-global: `npx agentsmith --user`

   Local-clone fallback when `npx` is unavailable: from a checkout of the agentsmith repo, `node bin/cli.js` (project) or `node bin/cli.js --user`.
3. Report what was written (the generated `AGENTS.md` + on-demand bundles, and for `--user` the `~/.claude/CLAUDE.md` import block).

Instructions always come from the generator — AI-neutral and project-tailored. This command never injects frozen instruction text.
