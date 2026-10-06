# Validate code-review-board reconcile transitions against issue placement

## What

The board's reconcile step lets a reviewer transition a prior issue, and `persist.mjs` applies the transition mechanically; nothing validates that the transition is legal for the issue's current placement.
`reopen` and `still-open` both land an issue in `open/`: `reopen` is for a closed issue that regressed and deletes `closingComments` and `closedInRound`, while `still-open` confirms an already-open issue and keeps those fields, so `still-open` on a closed issue resurrects it with stale closing fields attached, and `lint.mjs` accepts the result because `open` carries no placement or closing-field constraint.
Two independent layers close the hole: `persist.mjs` validates each transition against placement (`still-open` only on an open issue, `reopen` only on a closed one, the closing transitions only on an open one) and fails the apply on an illegal pairing; `lint.mjs` rejects an `open` issue that still carries closing fields.
A reviewer-prompt guardrail (a closed, non-regressed issue emits no reconcile entry; a regression uses `reopen`) is a cheap third layer but is guidance, not enforcement.

## Why it matters

A closed issue, especially one a human deprecated or promoted, is a decision; the reconcile path can undo it with no error, no warning, and a store that lints clean, which is the silent failure `#swe-errors` exists to prevent.
It has happened: a reviewer marked two closed, non-regressed issues `still-open`, one deprecated on human review, and `persist.mjs` moved both back to `open/`.

## Constraints

- The store is local, per-machine, and gitignored; the fix ships as tooling under `tools/claude/skills/code-review-board/` and reaches consumers on their next `agentsmith` run.
- The declarative schema in `2026-10-05-persist-gate-is-hand-rolled.md` covers field shape, not placement legality, so this check stays a separate rule in the gate.
