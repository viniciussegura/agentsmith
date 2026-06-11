This bundle applies only when **authoring or auditing an instruction set built with agentsmith's own machinery** (an `instructions/` rule tree, `ownership.yaml`, and the generator) -- not when merely consuming generated instructions.

## #ai-instruction-review Instruction review

- The review engine's second application (#ai-review-engine): run the same roles over an **instruction set** itself (here, `instructions/` plus the generated output of `node bin/cli.js --stdout`), each role proposing missing or weak rules through its lens, instead of raising code issues.
- A round is always a **full audit** (no diff variant); it **opens by running the ownership coverage lint**, turning any orphan or double-owned `#tag` into the round's first proposal, since an unowned rule is one no lens would cover.
- Each role emits `new-rule` / `strengthen` / `rehome` / `reowner` proposals; a per-proposal verify confirms the gap is real and not already covered by a live `#tag`; an editor reduce deduplicates, runs the once-only structural rubric (self-reference, lean-split, normative voice), and reconciles ownership to keep every tag single-owned.
- It **proposes only** -- it never edits instruction sources: the single committed output is the rolling backlog `docs/future-work/proposed-instruction-rules.md`. Adopting a proposal into `instructions/` stays a deliberate human action.
- Role **participation** is per-application: a lens active for code review may be inactive here (e.g. `correctness` audits code, not rules).
