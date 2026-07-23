# Future work: validate code-review-board reconcile transitions against issue placement

Date: 2026-07-22
Status: Deferred (`#swe-future-work`)
Context: surfaced by the code-review-board round `2026-07-22-instruction-terminology-audit` (see the local board store under `.agentsmith/review-board/`, gitignored).

## The gap

The code-review board's reconcile step lets a reviewer transition a prior issue, and `persist.mjs` (`applyReconcile`) applies that transition mechanically.
Nothing validates that the transition is legal for the issue's **current placement**.

Two transitions both land an issue in `open/`:

- `reopen` -- intended for a **closed** issue that regressed; it deletes `closingComments` and `closedInRound`.
- `still-open` -- intended to confirm an **already-open** issue stays open; it keeps `closingComments`/`closedInRound` and advances `lastConfirmedCommit`.

A reviewer that emits `still-open` on a **closed** issue therefore resurrects it out of `closed/` into `open/` while leaving the stale closing fields attached -- a record that reads `status: open` with a `closingComments` explaining why it was closed.
`lint.mjs` does not catch this: an `open` status carries no placement or closing-field constraint, so the store passes.

This actually happened in the round above: the `swe` reviewer marked two prior issues `still-open` that its own notes described as closed and **not** regressed, and one of them had been **deprecated on human review**.
`persist.mjs` moved both back to `open/`, silently overriding a human decision.
It was caught only by a manual read of the reviewer's reconcile notes, then hand-reverted.

## Why it matters

A closed issue -- especially one a human deprecated or promoted -- is a decision.
The reconcile path can undo that decision with no error, no warning, and a store that still lints clean.
The blast radius is bounded (the store is local and gitignored, the durable record is the external tracker), but the failure is silent, which is the property `#swe-errors` exists to prevent.

## Remediation sketch

Two independent layers, either of which closes the hole:

1. **`persist.mjs` validates the transition against current placement.**
   A `still-open` is legal only on an `open` issue; a `reopen` only on a `closed` (reopen-eligible) one; the closing transitions (`fixed`/`deprecated`/`superseded`) only on an `open` issue.
   An illegal pairing is a scratch error that fails the apply (fail closed, like the rest of `persist.mjs`), not a silent mutation.
2. **`lint.mjs` rejects the contradictory resting state.**
   An `open` issue that still carries `closingComments`/`closedInRound` is structurally invalid; flag it as an error so a resurrected issue cannot pass even if it reaches the store by another path.

A reviewer-prompt guardrail (a closed, non-regressed issue emits **no** reconcile entry; a regression uses `reopen`, never `still-open`) is a cheap third layer, but prompt guidance is not enforcement -- the deterministic checks above are the real fix.

## Constraints

- The board store is local, per-machine, gitignored; a fix ships as tooling (`persist.mjs`/`lint.mjs` under `tools/claude/skills/code-review-board/`) and reaches consumers on their next `agentsmith` run.
- Out of scope for the branch that surfaced it (`docs/instruction-terminology-audit`, PR #17), whose unit of work is the terminology audit and the spec-review guard -- a different subsystem from the code-review-board reconcile path.
