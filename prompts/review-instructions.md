# Prompt: Review the `/instructions` structure

Standardized prompt for auditing the `instructions/` rule set and its generated `AGENTS.md`.
Run it whenever instructions change, or on a cadence, to keep the rule set clear, terse, and coherent.

## Usage

Paste the task below to an agent, or invoke it as a saved prompt.
Replace `instructions/` only if the rule sources move.

---

## Task

Do a full review of `instructions/`.
First read every file under `instructions/`, plus `manifest.json` and the generated output (`node bin/cli.js --stdout`), so the review reflects what consumers actually receive after inlining.

Evaluate the rule set against these dimensions.
For each, give a one-line verdict (Strong / Good / Weak / Gaps) followed by specific findings that cite `file` and `#tag`.

1. **Clarity** -- are rules unambiguous for both humans and agents? Flag overloaded sections, vague scope, and undefined terms.
2. **Terseness** -- are we token-conscious? Flag recitation of common knowledge, spec-level detail that belongs in a doc, and redundancy.
3. **Cohesiveness** -- do any rules contradict each other or the house style? Check cross-references resolve to a real `#tag` (no dangling refs).
4. **Efficiency** -- can each rule be applied systematically? Prefer file-anchored, checkable rules over aspirational prose.
5. **Enforceability** -- which rules are lint-able or CI-checkable, and does the rule set say they are enforced?
6. **Self-reference integrity** -- every `#tag` referenced exists; every section has a unique tag.
7. **Coverage** -- what does a good software-engineering setting expect that is missing?
8. Add any other dimension that proves relevant; name it explicitly.

Separately, list **mechanical nits** (typos, grammar, stray whitespace, broken links, invalid markup) as a short actionable list.

## Inlining awareness

The modules merge into a single `AGENTS.md`, so file names disappear from the output.
- Cross-reference rules by `#tag`, never by file name.
- Emit order matters: related domains should be adjacent in `manifest.json`.

## Propose missing instructions

Propose new instructions a good software-engineering setting should have but the rule set lacks.
Maintain a running, prioritized backlog: re-rank it each run, note what moved and why, and mark anything newly closed by recent edits.
For each proposal give: tag, the gap it closes, and a one-line rationale.
Recommend the top few to draft next.

## Output format

- Dimension verdicts as a compact table, then findings.
- Mechanical nits as a bullet list.
- Proposals as a ranked table with a "change vs last run" column.
- End with a recommended next action.

Do not edit files as part of the review unless explicitly asked; review and propose only.
