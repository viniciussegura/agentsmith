# Review-engine future work

Deferred extensions to the role-based review engine (`#ai-review-engine`), out of scope for the review-board landing (`docs/working-specs/2026-06-09-review-board/`).
Recorded on approval of that work (`#swe-future-work`).

## Additional reviewer roles: performance, accessibility, scalability

**What.** New lenses in the shared role registry -- `performance` (hot paths, allocations, query/N+1 cost), `accessibility` (a dedicated a11y lens beyond `frontend`'s `#front-a11y`), `scalability` (load, concurrency, data-growth behavior).
**Why.** They benefit both applications (code review and instruction review) the same way the initial eight do, sharpening coverage no current lens owns well.
**Constraints / dependencies.** Each needs its own reviewer persona (`tools/claude/agents/review-<id>.md`), a `roles.yaml` row, gating globs/keywords in the default `config.yaml`, and -- if it owns instruction rules -- ownership rows in `ownership.yaml` (the coverage lint will demand them). Splitting `accessibility` out of `frontend` means re-adjudicating which `#front-a11y`/`#ui-*` tags it owns.

## Official-tracker API bridge

**What.** Promote board issues into GitHub/Jira programmatically, instead of a human pasting the URL into `/review-promote`.
**Why.** Removes the manual copy step while keeping promotion the human-validation gate; the issue store already carries `promotedTo`.
**Constraints / dependencies.** Auth/secret handling per `#swe-security`/`#swe-environment` (tokens never logged or committed); must stay opt-in and not auto-push (a non-goal of the current spec); idempotent like `/review-promote`. An HTTP boundary is new surface for this otherwise local, file-based tool.

## Adapters for non-Claude tools under `tools/<ai>/`

**What.** First-class adapters (skills/commands/agents equivalents) for other assistants -- e.g. `tools/codex/`, `tools/gemini/` -- mirroring `tools/claude/`.
**Why.** Today non-Claude tools run the protocol only in the degraded mode they read from `AGENTS.md`; native adapters would give them real fan-out/verify/reduce where their runtime supports it.
**Constraints / dependencies.** The generator's `planToolInstall` already generalizes `tools/<ai>/ -> .<ai>/`, so the plumbing exists; the work is authoring each tool's native artifact format. Each adapter must stay in lockstep with the portable protocol so the three degradation tiers do not diverge.
