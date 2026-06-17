# Spec: triage worksheet v2 -- checkbox decision, decisionText, refine

Status: Approved

A delta over [the v1 worksheet spec](../2026-06-16-instruction-triage-worksheet/spec.md) (Approved, frozen). It changes only how a human records a decision in `.agentsmith/instruction-review/triage.md`; the round flow, the gate, the apply idempotency model, and the decisions-log format are unchanged unless stated here.

## Problem

The v1 `decision:` is a free-text key (`park | adopt | reject | fold:<tag> | defer:<condition>`). Free text invites typos (`adpot`), casing drift (`Park`), and invented classes -- exactly the parse fragility spec-review fought. It also forces the parameter (fold target, defer condition, reject reason) onto the same line, and puts the decision near the top, ahead of the gap/draft the human must read first.

## Changes

### C1 -- Decision as a checkbox set (closed option list)

Replace the `- decision: <value>` line with a **bare `decision:` marker** (no leading `- `, which is what distinguishes a section marker from `- key:` metadata) followed by a GFM task list of the five fixed options, in order:

```
decision:
- [ ] adopt
- [ ] reject
- [ ] fold
- [ ] defer
- [ ] refine
```

- **None ticked = `park`** (the safe default; `park` is not itself a checkbox).
- A **tick** is a line matching exactly `^- \[[xX]\] <label>$`; a **blank** is `^- \[ \] <label>$` (one space after `-`, one char in the brackets). `<label>` is one of the five.
- **Disposition is read only from the ticked line's label.** Unticked labels are not validated (a typo in a line the human never touched cannot brick the entry); a missing option line just makes that option un-tickable -- not malformed.
- **Malformed** (reported, skipped -- never a silent downgrade to park): two or more ticks; a checkbox-shaped line (`- [...]`) inside the block matching neither the tick nor the blank grammar (e.g. `-[x]`, `* [x]`, `[ x ]`, `- [x]adopt`); or a ticked label outside the five.

### C2 -- Decision goes last, followed by a `decisionText` block

Order within an entry: heading -> `- key:` metadata (`kind`, `role`, `targetFile`/`proposedFile`/`proposedOwner`, `status`, `gap`) -> `draft` fenced block -> bare `decision:` marker + checkbox set -> bare `decisionText:` marker. Reading flow: read the gap, read the draft, decide, write reasoning, next.

`decisionText:` is a free-text block: everything from the `decisionText:` marker to the next `### ` or EOF. It has two parts split by an apply-managed sentinel line `<!-- apply-log -->`:

- **Above the sentinel** -- the human's text (reason / fold target / defer condition / refine input). This is the **only** part apply reads for parameters.
- **Below the sentinel** -- apply's own failure records (the old `- note:`), appended on a re-park. The parser **ignores** this part for every param / non-empty check. apply creates the sentinel the first time it needs to write a note; **absent the sentinel, the whole `decisionText` body is the human part**. apply splits on the **first** `<!-- apply-log -->` occurrence (the one it created); a human who types that exact string into their own reason only mis-scopes their own text -- it degrades to a reported empty/malformed param, never a silent wrong write.

Parameters by disposition (read from the human part only):

- `reject` -> the whole human text is the reason (non-empty required).
- `fold` -> the **first non-blank line** of the human text begins with the target `#tag` (form `#tag -- <reason>`): that leading token is the fold target, the rest is the reason. A fixed position, so an incidental `#tag` later in the prose is never mistaken for the target.
- `defer` -> the human text is the condition (non-empty required).
- `refine` -> the human text is the input / question (non-empty required).
- `adopt` / `park` -> `decisionText` not required.

The `- reason:` and `- note:` keys are **removed** (subsumed by `decisionText`). `decisionText` starts empty.

### C3 -- New `refine` disposition

`refine` means "I have input or questions -- surface this back for discussion now," distinct from `park` (silent carry). Apply behavior:

- Writes **nothing** (no `instructions/`, no decisions log).
- **Leaves the entry** in the worksheet (not pruned).
- **Reports** every `refine` entry with its `decisionText` prominently, so the next conversation turn can iterate (edit the draft, then the human re-decides).

`refine` requires a non-empty `decisionText` (else malformed -- a refine with no input is just a park).

## Parse contract additions (apply A1)

- **Section markers** `decision:` and `decisionText:` are bare lines (no leading `- `), distinguishing them from `- key:` metadata. They are recognized only **outside** the draft fence; two bare `decision:` (or `decisionText:`) markers in one entry -> malformed (the duplicate-key rule extended to the bare markers).
- The **checkbox block** is the contiguous run of tick/blank lines (C1 grammar) immediately following the `decision:` marker, terminated by the first non-matching line (in practice the blank line before `decisionText:`). Tick-counting is scoped **strictly** to this block -- never the draft-fence interior, never the `decisionText` body, so a `- [ ] adopt` pasted into prose or a draft is inert.
- Map the single ticked label to the disposition; none -> `park`; the C1 malformed rules apply.
- Parameter extraction reads only the **human part** of `decisionText` (above the `<!-- apply-log -->` sentinel): `fold` -> the first-line leading `#tag` must be resolvable; `reject`/`defer`/`refine` -> non-empty.
- Everything else from v1 holds (duplicate-tag, duplicate-key, draft-fence, `\r?\n`).

## Apply pipeline changes (A3/A4)

- Disposition is read from the ticked checkbox, not a value string; reason/target/condition come from the human part of `decisionText`.
- `refine` -> apply writes nothing, **leaves the entry** (never pruned; gate-(ii) treats it like `park`), and **reports** it with its `decisionText`. A refine entry persists across apply passes exactly like park and is resolved only by the human re-ticking it to a terminal disposition (adopt/reject/fold/defer) -- it cannot get stuck beyond the human's own choosing. When `/instruction-apply` runs in a conversation, the agent relays the refine report so the discussion can happen that turn.
- A re-parked apply failure clears the tick (none = park) and appends its record **below** the `decisionText` sentinel (was `- note:`), leaving the human part untouched.
- Report buckets: adopted / rejected / folded / deferred / **refined** / parked / failed.
- The setup gate's `K` (un-applied decisions) counts only the applyable terminals (adopt/reject/fold/defer); `refine` is reported separately and **not** counted in K, so the gate's "K will be archived, not applied" warning stays accurate.

## Migration

Re-convert the existing `.agentsmith/instruction-review/triage.md` (**32** entries, all currently `park`, no marks) to the v2 layout: drop the `- decision: park` line, keep metadata above the draft, append the bare `decision:` checkbox set (none ticked) and an empty `decisionText:` after the draft. Also correct the file's stale intro line ("33 verified" -> the 32 it actually holds). No decision is lost (none were marked).

## Acceptance criteria

1. A converted worksheet has, per entry, the metadata + draft + a 5-option `decision:` checkbox set (none ticked) + empty `decisionText:`; no `- decision:`/`- reason:`/`- note:` keys remain.
2. Ticking exactly one box and running `/instruction-apply` applies that disposition; reason/target/condition are read from `decisionText`. None ticked = park (left in place).
3. Two ticked boxes in one entry -> malformed, reported, skipped (no write).
4. `fold` ticked with no resolvable `#tag` in `decisionText` -> malformed. `reject`/`defer`/`refine` with empty `decisionText` -> malformed.
5. `refine` ticked -> apply writes nothing, leaves the entry, and reports it with its `decisionText`.
6. Everything in v1 not changed here still holds (gate, idempotent ensure-end-state, per-entry snapshot recovery, decisions-log format, crash resumability).
7. A `fold` reads its target from the **first-line leading `#tag`** of `decisionText`, ignoring any other `#tag` later in the prose. A re-parked failure's record lands **below** the `<!-- apply-log -->` sentinel and is ignored by param/non-empty checks (so a failure note is never read back as a fold target or condition). A `- [ ] adopt` line inside a draft or in `decisionText` prose does not count as a tick.

## Out of scope (plan)

- The SKILL.md Apply-pipeline + step-5 worksheet-format prose edits, the command-description touch-ups, and the one-time migration of the live `triage.md`.
- No standalone linter binary: the >=2-tick / param checks live in apply's A1 validation (the worksheet is agent-parsed, not a CI artifact).
