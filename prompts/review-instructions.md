# Prompt: Review the `/instructions` structure

Standardized prompt for auditing the `instructions/` rule set and its generated `AGENTS.md`.
Run it whenever instructions change, or on a cadence, to keep the rule set clear, terse, and coherent.

> **Preferred path: the instruction-review application** (`#ai-instruction-review`, the `/instruction-review-board` skill) fans this audit out **per role** for sharper, less-diluted coverage.
> This prompt is the **single-agent degraded fallback** of that application (`#ai-review-engine` degradation): one agent applies the dimensions below across all lenses sequentially.
> Either way there is **one rubric and one committed output** -- the nine dimensions here are the shared rubric the per-role fan-out also applies, and the only committed artifact is the decisions log `docs/instruction-rules-decisions.md` (open proposals are ephemeral: the per-role path writes a structured triage worksheet, this fallback presents them inline). No duplication (`#swe-reuse`).

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
8. **Lean-split integrity** -- in the default lean layout, core sections load every session and bundles load on demand. A core rule must not reference a bundle-only `#tag` -- it dangles for sessions that never load the bundle; bundle-to-core references are safe. Flag any core-to-bundle reference, citing both tags and their sections.
9. **Normative voice** -- strong requirements use a consistent keyword style: bold **MUST** / **MUST NOT** / **Never** for hard rules, plain imperative for directives, and `should` only for genuine recommendations. Flag a rule that mixes soft and hard wording for the same obligation, or the same keyword bolded in one place and plain in another.
10. Add any other dimension that proves relevant; name it explicitly.

Separately, list **mechanical nits** (typos, grammar, stray whitespace, broken links, invalid markup) as a short actionable list.

## Inlining awareness

The modules merge into a single `AGENTS.md`, so file names disappear from the output.
- Cross-reference rules by `#tag`, never by file name.
- Emit order matters: related domains should be adjacent in `manifest.json`.

## Surface proposals; record only decisions

This fallback **writes no instruction sources and keeps no backlog file** -- open proposals are ephemeral. The only committed artifact is the decisions log `docs/instruction-rules-decisions.md` (closed judgments: rejected / folded / deferred, one line per `#tag`).

Each run:

1. Read the decisions log and the live `#tag`s in the generated output first, so you neither re-raise an adopted rule nor re-litigate a closed judgment.
2. For each new gap, present a proposal inline in your reply: tag, target file, the gap it closes, a one-line rationale, any blocker or condition, and a drop-in house-style block once the rule is concrete enough to draft.
3. The human dispositions them; adoption happens through the per-role application's `/instruction-apply`, never here.

In your review reply, summarize the gaps found and recommend the top few to draft next.

## Output format

- Dimension verdicts as a compact table, then findings.
- Mechanical nits as a bullet list.
- Proposals as a ranked table with a "change vs last run" column.
- End with a recommended next action.

Do not edit instruction sources as part of the review -- propose only.
This review writes no files; closed judgments persist in the decisions log `docs/instruction-rules-decisions.md` via the per-role application's `/instruction-apply`.
