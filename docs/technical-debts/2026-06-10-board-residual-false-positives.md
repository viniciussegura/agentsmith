# Board residual false-positives in never-touched files

**Debt.** A code-review board finding that slips past the verify stage and then sits in a file that is never touched again is not re-examined by ordinary `diff` rounds: reconcile only re-checks an issue when its file is dirty (`git diff lastConfirmedCommit..commit` touches its paths), and verify is one-time-at-entry on new findings. So a false positive in a quiescent file can persist in the committed store.

**Why accepted.** Re-verifying every carried-forward issue every round would defeat the carry-forward-without-re-read token discipline that makes the board cheap (`#ai-review-board`, Token efficiency). The design deliberately trades this residual for cost.

**Cost / risk.** Low and bounded: the issue is already in the store (visible to humans), it does not block, and the three adversarial filters keep most false positives out at entry. The risk is a stale low-value issue lingering until someone notices.

**Remediation sketch.** A periodic `full-sweep` round re-checks every prior open issue regardless of dirtiness and retires the invalid ones -- this is the intended mitigation. A future option is an age-based auto-flag that nudges a `full-sweep` when the oldest unreconciled issue crosses a round-distance threshold.
