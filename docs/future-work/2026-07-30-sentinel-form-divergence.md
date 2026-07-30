# Prompt-injection sentinel form diverges between rule and implementation

Date: 2026-07-30

## What

`#swe-prompt-injection-sentinel` documents one sentinel form and the review-board tooling emits a different one. The rule requires them to be the same:

> The sentinel form stated in this rule and the shared constant in the implementation are a **single source of truth**: they **MUST** be identical, and any change to one is a change to both.
> A silent divergence between the documented form and the running one reopens the injection boundary without warning.

| side | form |
| --- | --- |
| rule -- `instructions/core/swe/swe-prompt-injection-sentinel.md` | `--- BEGIN UNTRUSTED DATA: <source> ---` / `--- END UNTRUSTED DATA ---` |
| implementation -- `tools/claude/skills/code-review-board/round-args.mjs` | `--- DATA: <source> (untrusted) ---` / `--- END DATA ---` |

The implementation side is internally consistent across four sites -- `round-args.mjs` (the exported `DATA_OPEN` / `DATA_CLOSE` constants), `reviewer-common.md`, `docs/reference-spec/review-board-protocol.md`, and the assertions in `test/round-args.test.mjs`. The rule is the lone outlier.

## Why it matters

`#swe-security` marks the sentinel protocol part of the **non-waivable** safety baseline, and this is precisely the failure the rule names: the documented form and the running form have drifted apart with nothing detecting it.

Nothing is leaking today. Both forms are distinctive, paired delimiters, so the boundary functions in each case. The live cost is that an agent following the *rule* and a code path following the *constant* emit different delimiters for the same job -- observed during the 2026-07-30 spec-review rounds, where hand-authored sub-agent dispatches used the rule's form while the board's own tooling used the constant's. Any future check, test, or reviewer keyed to one form silently passes content wrapped in the other.

## The decision this needs

Which form is canonical. The options are not symmetric:

1. **Rule adopts the implementation's form.** One file changes. The running code and its test already define reality, and the constants are exported and testable.
2. **Implementation adopts the rule's form.** Four sites plus a test assertion change. Keeps the specification authoritative, which is the reason a documented form exists at all.

Option 2 is the more principled reading of the rule's own "single source of truth" clause; option 1 is cheaper and lower-risk. Either way the change must land on both sides in one commit -- that is the rule's explicit requirement.

## Constraints

- Whichever form wins, `DATA_OPEN` / `DATA_CLOSE` stay the single exported constant (`#swe-prompt-injection-sentinel` requires the marker be defined once and reused, never re-spelled per call site).
- `test/round-args.test.mjs` asserts the literal strings and must move with them.
- Consider adding a check that fails when the rule text and the exported constant disagree -- the absence of one is why this drifted unnoticed.

## Provenance

Found 2026-07-30 while verifying that a markdown fence-language edit had not altered the sentinel blocks. Pre-existing and unrelated to that change; surfaced rather than absorbed, since a security-baseline correction is its own unit of work.
