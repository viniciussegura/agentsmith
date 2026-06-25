# #ai-session-hygiene Session hygiene

At the end of a unit of work, decide whether anything learned this session warrants persisting -- a reusable work standard, a new memory, or a cross-cutting design decision (#swe-design-decisions) -- and state that decision (a chosen scope, or "nothing to persist").
The same #ai-persistence logic governs standards and memories: ask, then scope it session / project / user -- a standard meant to apply across projects persists at user scope, one specific to this project at project scope.
A design decision is always project scope (a committed `docs/design-decisions/` file); the reach test (#swe-design-decisions) decides only whether it warrants a file, independent of that tier.
