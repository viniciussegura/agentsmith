# Future work: instruction-set terminology audit

Date: 2026-07-22
Status: Deferred (`#swe-future-work`)
Context: the branch that added `#swe-branch-lifespan` and split `#swe-done` into tiers

## The gap

Splitting `#swe-done` by altitude exposed that `unit of work` was bound at two altitudes at once -- `#git-branch-workflow` used it for a whole branch, `#ai-plan` for one working-spec directory -- so transitively the set asserted that a branch is one working spec, which `#git-branch-workflow` itself denies two lines later.
The clash was harmless until a rule had to count units per branch.

That branch fixed the one clash it hit, and fixed the level-3 synonym spread it noticed in passing (`step` / `wave` / `task` -> `plan step`), landing the three-altitude vocabulary in `instructions/main.md`.
It did **not** audit the rest of the set.
Other concept clusters are unaudited and likely carry the same kind of silent drift -- candidates seen while working nearby: spec/plan/artifact, change/diff/commit, review/audit/check, done/complete/landed/shipped.

## The deferred work

A full terminology audit of `instructions/`, run as an inventory rather than a read-through, since the drift is mechanically discoverable and only the synonym clustering needs judgment:

1. Build a concept -> terms table across every rule file, from grep over candidate clusters.
2. Adjudicate the canonical term per concept (human decision, not search).
3. Apply the renames, and extend the `instructions/main.md` vocabulary block with any altitude-bearing term the audit settles.

`#swe-terminology` is deliberately **not** the home for that vocabulary: it governs the software a project writes, not the instruction set itself.

## Constraints

- The set is installed by other projects. A rename ships a vocabulary change to every consumer, and a project-level instruction file or session memory holding the old noun keeps it until regenerated. Prefer one audited pass over a trickle of renames.
- Frozen working specs (`#ai-plan`) are point-in-time and stay on the old vocabulary; only present-truth docs and `instructions/` are in scope.
