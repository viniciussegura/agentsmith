---
name: instruction-check
description: Grade the current change against this project's generated instruction set (AGENTS.md) in a single fast pass. Use when the user runs /instruction-check, or asks to check/grade a diff against the rules/instructions, or wants a quick conformance pass before merge. One agent, no persistence -- lighter than the review board (#ai-review-board), a fresh-eyes step above #swe-done self-review.
---

# Instruction check

A single-agent, ephemeral conformance pass: read the current change and the project's
own instruction set, and report where the diff violates a rule. This is the **light tier**
of review -- it does not replace either neighbour:

- **Below it:** `#swe-done` item 5 self-review -- the author's own floor.
- **This:** a deliberate fresh-eyes pass against the written rules, scoped to the diff.
- **Above it:** `#ai-review-board` -- the multi-role engine with adversarial verify, an
  issue store, and a PM triage report. Reach for the board when the change is large or
  high-stakes; reach for this when you want a fast gate before squash-merge.

Do **not** re-implement the board here: no role fan-out, no verifier, no persistence,
no issue store. One agent, one pass, output to the chat.

## When to run

- The user invokes `/instruction-check [<branch>]`, or asks to grade/check the current
  change against the instructions before merge.

## Pipeline

### 1. Locate the rubric

The rubric is the project's **generated** instruction set, not these skill files. Find it
in this order and read it whole:

1. `AGENTS.md` at the repo root (root placement), or
2. `.agentsmith/AGENTS.md` (nested placement -- a root `AGENTS.md` stub points here), or
3. the nearest `AGENTS.md` an agent would actually load for the changed paths.

Also load any bundle the change touches (front-end / back-end / authoring) so bundle-only
`#tags` resolve.

### 2. Scope the diff

Default subject is the current branch vs the configured default branch
(`git merge-base`-based, squash-safe); with no feature branch, the uncommitted working +
staged changes. Read the diff **and** the full touched files for context -- a violation
is often in what the diff left unchanged (a stale doc, a missing test).

### 3. Grade

Walk the changed surface against the rubric's `#tags`. For each finding emit exactly one line:

```
path:line -- #tag: the specific problem. the concrete fix.
```

Rules for credible findings:

- Cite a real rule by its `#tag`; if no rule covers it, it is not an instruction-check finding.
- Quote the offending surface (`path:line`), never a vague "somewhere".
- One finding per distinct violation; do not pad. Skip style a formatter/linter already owns (#code-style).
- Bias to the diff: a pre-existing violation the change did not touch is out of scope -- note it once, separately, do not list it as a finding.

### 4. Present

Open with a one-line verdict: `clean` or `N finding(s)`. Then the findings list, grouped by
file. Close with the single most important fix to make first. No issue ids, no files written.
If the change clearly warrants the heavier pass, say so and offer `/review-board`.
