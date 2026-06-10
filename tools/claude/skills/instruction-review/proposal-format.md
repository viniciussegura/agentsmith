# Proposal format and backlog maintenance

Reference for the instruction-review application (`#ai-instruction-review`): the proposal schema, the rubric, and how the rolling backlog is maintained.
This application **proposes only** -- it never edits instruction sources.
It generalizes `prompts/review-instructions.md` from one umbrella reviewer to a per-role fan-out; that prompt's rubric and backlog steps are reused here, not duplicated.

## Schema

```typescript
type ProposalKind =
  | 'new-rule'    // a rule the domain expects but the set lacks
  | 'strengthen'  // an existing rule that is too weak/ambiguous
  | 'rehome'      // an existing rule that should move to a different instructions/ file
  | 'reowner';    // an existing rule whose ownership row should change owner

interface InstructionProposal {
  kind: ProposalKind;
  tag: string;        // new #tag (new-rule) or an existing #tag (strengthen/rehome/reowner)
  role: string;       // role id (lens) that raised it -- ties the proposal to the shared registry
  gap: string;        // the gap or problem it addresses
  rationale: string;  // one line
  status: 'ready' | 'blocked' | 'conditional'; // matches the backlog statuses
  blockedOn?: string; // a #tag or condition, when status is blocked/conditional
  targetFile?: string;    // new-rule/strengthen: the instructions/ file the rule belongs in
  draft?: string;         // new-rule/strengthen: a drop-in house-style rule block, once concrete
  proposedFile?: string;  // rehome: where the rule should move
  proposedOwner?: string; // reowner: the role / base lens / non-review marker it should be owned by
}
```

**Required per kind** (the reduce step rejects a proposal missing its kind's field): `new-rule` and `strengthen` require `targetFile`; `new-rule` also requires `draft` once concrete; `rehome` requires `proposedFile`; `reowner` requires `proposedOwner`, which must be a **resolvable owner** (a declared role, the `swe` base lens, or a known non-review marker -- else the editor rejects/normalizes it).

## Rubric

Per-lens dimensions each participating role applies within its domain:

- **Coverage** -- a rule the domain expects that is missing or too weak.
- **Clarity / terseness / efficiency / enforceability** -- of the rules already in the role's domain.
- **Ownership & placement** -- whether a rule the role owns (or believes belongs to its lens) is owned by the right role and located in the best file; raise a `rehome` or `reowner` where not.

Global/structural dimensions are **not** per-lens; the editor runs them once in reduce: self-reference integrity (every `#tag` resolves, every section has a unique tag), lean-split integrity (no core rule references a bundle-only tag), and normative voice (consistent **MUST**/**Never**/`should`). No role duplicates these.

## Backlog maintenance (the only file written)

The single committed output is the rolling backlog `docs/future-work/proposed-instruction-rules.md` (one file, rewritten in place each round -- not dated snapshots). Reconciliation **is** this roll; there is no issue store, no round store, no commit baseline.

Each round, the editor:

1. Reads the backlog first.
2. Drops any proposal already adopted into `instructions/` (check the live `#tag`s in `node bin/cli.js --stdout`).
3. Re-checks every remaining proposal: does it still close a real gap? Rewrites stale wording; demotes/removes ideas overtaken by recent edits.
4. Adds a proposal for each new gap found this round (with a drop-in house-style block once concrete).
5. Reconciles `rehome`/`reowner` proposals to a single owner and confirms the ownership map would stay **complete and single-owner** under the change.
6. Rebuilds the summary table (rank, tag, target, gap, status) and lists what was adopted-and-removed since the last roll.
