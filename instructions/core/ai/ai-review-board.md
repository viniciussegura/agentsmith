# #ai-review-board Code-review board

- On request, run the engine (#ai-review-engine) over the repo state or a branch-vs-default-branch diff; each role raises structured issues through its lens, then a project-manager reduce consolidates priority, groups issues into epics, and writes a prioritized triage report.
- `correctness` (behavior bugs) and `swe` (the base lens) **always run**; other roles are gated by the paths and commit messages the change touches -- a relevant lens is never silently skipped, an irrelevant one never paid for.
- The board is a triage layer **on top of** the team's tracker, not a replacement: a human promotes a board issue into the tracker, and that promotion is the human validation of the AI-raised finding.
- `baselineCommit` is always a live default-branch SHA: a feature-branch round uses `merge-base(commit, default)` (squash-safe); a default-branch round chains off the prior default-branch round.
- Each issue carries a globally-unique compositional id `<roundId>#<role>-<n>` minted by the raising round; ids are never reused, so cross-issue links stay valid.
- Issues move through a single-owner lifecycle: 
  - `open` (raised, not yet actioned); 
  - `promoted` (escalated to the external tracker -- not a closing status); 
  - `fixed` (a fix was committed); 
  - `deprecated` (no longer relevant -- the feature, file, or scope it covered was removed or changed by design, no fix needed);
  - `superseded` (replaced by a newer issue with broader or more precise framing -- reference the superseding id);
  - `duplicated` (identical or near-identical to another open issue -- reference the canonical id).
- Persistence is local-first: the whole board -- the issue/epic/round store and its `config.yaml` -- lives under `.agentsmith/review-board/` (gitignored, per-machine, never committed).
  The single durable, shared record of a finding is its promotion to the team's external tracker; the baseline is confirmed through the setup gate (the tracker and git history carry cross-machine continuity). 
  Per-run reasoning stays ephemeral under `.agentsmith/tmp/`.
- A second application, **instruction review**, turns the same roles on an instruction set itself; it applies only to repos authoring an agentsmith-style set, so it is an on-demand bundle (`#ai-instruction-review`), not part of this core.
