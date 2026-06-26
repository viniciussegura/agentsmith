---
description: Regenerate (or --check) the working-specs index docs/working-specs/INDEX.md for this project.
argument-hint: [--check]
---

Maintain the generated working-specs index (`#ai-plan`). Arguments: $ARGUMENTS

Run `agentsmith spec-index` to regenerate `docs/working-specs/INDEX.md` from the `docs/working-specs/<YYYY-MM-DD>-<slug>/` corpus, or `agentsmith spec-index --check` to validate it without writing (exits non-zero when stale -- the `#swe-done` drift backstop).

If the `agentsmith` CLI is not on `PATH`, invoke it through the installed package: `npx -y agentsmith spec-index` / `npx -y agentsmith spec-index --check`. A project with no `docs/working-specs/` is a no-op.
