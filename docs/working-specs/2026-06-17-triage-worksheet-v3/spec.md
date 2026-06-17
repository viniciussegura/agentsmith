# Spec: triage worksheet v3 -- `current:` before/after block

Status: Approved

A delta over [the v2 worksheet spec](../2026-06-16-triage-worksheet-v2/spec.md) (Approved, frozen) and, transitively, [v1](../2026-06-16-instruction-triage-worksheet/spec.md). It adds **one read-only field** to a worksheet entry so a reviewer sees the current instruction text beside the proposed one, and -- as a prerequisite -- replaces the positional rule that locates the draft. The round flow, the gate, the checkbox decision grammar, the `decisionText` contract, the apply idempotency model, and the decisions-log format are all unchanged unless stated here.

## Problem

A worksheet entry shows only the `draft:` -- the proposed end state. For a `strengthen` (replace an existing `#tag` section, 23 of the 32 live entries) the reviewer has to mentally recall, or go open `instructions/`, to see what is actually changing. There is no before/after at the point of decision. The natural request is "show it like a diff."

A literal unified-diff *as the stored/applied artifact* was considered and rejected:

- Apply is deliberately **declarative ensure-end-state**, not patch-apply (v1 §3.5). Agents emit fragile hunks (wrong line numbers, stale context); a patch that fails to apply is worse than the current declarative draft.
- Diff `+`/`-` lines collide with the hard-won checkbox / bare-marker / fence grammar (v2). Reintroducing leading-`+`/`-` parse significance is a regression in the parse contract.
- The worksheet is **hand-edited** (tick a box, type in `decisionText`). A diff body is noisy to read and easy to corrupt by hand.

So this spec adds the before/after as **review-surface data, not an apply payload**: a verbatim snapshot of the current source section, stored next to the draft. The human (or a renderer) diffs the two; apply never reads it.

## Changes

### C0 -- Locate the draft by a bare `draft:` marker, not by fence position (prerequisite)

v1 §1.2 / v2 (SKILL.md "The draft is the **first fenced code block** in the entry") locate the draft **positionally**. Adding a second fenced block (`current:`) before it would silently break that rule -- the snapshot would become "the first fence" and be read as the draft. This delta therefore **supersedes the positional locate rule**:

- `draft:` becomes a **bare section marker** (no leading `- `), joining `current:` / `decision:` / `decisionText:` in the bare-marker family. The live worksheet already writes a `draft:` label line ahead of the fence (v1 §1.2 example); this delta makes that line **authoritative** rather than decorative.
- The **draft body** is the fenced block **immediately following the `draft:` marker** (the first fence after the marker), under the unchanged v1 fence grammar (4-backtick outer fence so nested 3-backtick code survives; missing/unterminated fence on a `new-rule`/`strengthen` -> malformed).
- The **`current:` body** is the fenced block immediately following the `current:` marker.
- Location is therefore **by marker, never by fence ordinality**. `current:` and `draft:` are matched independently of their relative order (the canonical order is C2; a reversed order is non-canonical but **not** malformed -- each is still found by its own marker).
- Duplicate-marker rule (v2) extends to `draft:`: two bare `draft:` markers in one entry -> malformed; likewise two `current:` markers.
- `new-rule` carries a `draft:` marker + fence and **no** `current:`; `rehome`/`reowner` carry no `draft:` fence (unchanged from v1) and, per C1, a `current:` only when text changes.

### C1 -- A read-only `current:` fenced block

Add an optional **bare `current:` marker** (no leading `- `) followed by a fenced block using the **same fence grammar as `draft:`**. It holds the **verbatim live source section** the draft modifies -- the `## #tag ...` heading through the line before the next section heading (or EOF), copied exactly from `targetFile` at round time. Section boundaries are pinned in §"Section extraction".

Presence by kind:

- **`strengthen`** -> `current:` **present** (the live section being replaced). This is the kind the field exists for.
- **`new-rule`** -> `current:` **omitted** (no before; the draft is a pure addition). A `current:` block here would be all-additions, zero comparison value, pure noise.
- **`rehome`** / **`reowner`** -> `current:` **present iff the draft changes the section's text**. When only the location (`rehome`) or owner (`reowner`) changes and the text is identical, the difference is already legible from the metadata (`targetFile`/`proposedFile`, `proposedOwner`) and `current:` is **omitted** to avoid an identical current/draft pair. None exist in the live set; this rule governs future rounds.

### C2 -- Placement and read flow

Canonical order within an entry: heading -> `- key:` metadata (`kind`, `role`, `targetFile`/`proposedFile`/`proposedOwner`, `status`, `gap`) -> **`current:` marker + fence (when present)** -> `draft:` marker + fence -> bare `decision:` marker + checkbox set -> bare `decisionText:` marker.

`current:` sits **immediately before** `draft:` so the two fenced blocks are adjacent (before/after order): read the gap, see the current text, see the proposed text, decide, write reasoning, next. Decision and `decisionText` stay last (v2 C2 unchanged). Per C0 this order is for generation/readability; parsing is by marker and order-independent.

### C3 -- `current:` is non-load-bearing: apply never reads it

- The single invariant: **apply never reads `current:`** for any purpose (disposition, parameter extraction, the ensure-end-state edit, idempotency, or the report buckets). Removing every `current:` block from a worksheet would not change any apply outcome.
- Because apply never reads it, `current:` is a **snapshot** explicitly allowed to drift from the live source between the round and apply, with no re-validation against the live file. (Apply's own strengthen edit independently re-reads and replaces the live section per v1 §3.5; that is orthogonal to `current:`.)

### C4 -- Generation

The `instruction-editor` reduce writes `current:` for a `strengthen` (and a text-changing `rehome`/`reowner`) by copying the verbatim section it already reads while verifying the gap (the gap check already loads that section). No new file reads. For `new-rule` (and text-unchanged `rehome`/`reowner`) it writes no `current:` marker. A `strengthen` that omits `current:` is a **generation defect**, but is **not** an apply-time error (C3, and the parse rule below): apply does not police `current:` presence, since it never reads the block.

### C5 -- Rendered diff is out of scope

Displaying a unified diff of `current:` vs `draft:` (e.g. in a terminal at review time) is **permitted but entirely out of scope for this spec**: never stored in the worksheet, never parsed back, not required for any acceptance criterion, and no algorithm/anchoring is specified here. This clause exists only to confirm the stored `current:`/`draft:` pair is a sufficient substrate for such a render to be built later.

## Section extraction (migration and C4 generation)

The `current:` snapshot, and the apply strengthen-replace target (SKILL.md A3), MUST use the **same** section delimiter so the snapshot byte-matches what apply replaces:

- **Heading depth is `##`.** Rule sections in the live `instructions/` files and in SKILL.md A3 are `## #tag ...`. v1 §3.5 (and §1.2's aside) said `### ` -- that was a **spec-side error already corrected in the SKILL.md implementation**; this delta pins `##` as the single correct depth. (`current:` extraction depth = apply strengthen-replace depth = `##`.)
- **The section** = the line matching `^## #<tag>(\s|$)` (exact `#`-prefixed tag, anchored, so `#swe-foo` never matches `#swe-foobar`) through the line **before the next `^## ` heading**, or EOF for the last section.
- **Nested `###`/`####` subheadings inside the section are included verbatim** (they are not `## ` lines). They do not terminate extraction and are unrelated to the worksheet's `### ` entry delimiter.
- A body line that literally begins with `## ` would truncate extraction early; instruction rule bodies do not contain such lines, and the anchored `^## #<tag>` start match plus the `^## ` boundary are the pinned contract. (No such case exists in the live files; flagged as the known boundary assumption.)
- Extraction assumes `## #tag` section headings; it is **undefined** for a `targetFile` using another heading depth (none exist; governs future rounds).

## Parse contract additions (apply A1)

- **Parse order (normative, single pass):** open/close fences are matched **first** under the v1 fence grammar; bare-marker recognition and duplicate-marker counting then run **only over lines not inside a matched fence**. This ordering is load-bearing: it is what makes a stray `draft:`/`current:`/`decision:` token typed inside a fence body provably inert, so it cannot spuriously trip the duplicate-marker rule.
- **Bare markers** are `current:`, `draft:`, `decision:`, `decisionText:` (no leading `- `), recognized only **outside** any matched fence (per the parse order above). The duplicate-marker rule applies to each: two of the same bare marker (outside fences) in one entry -> malformed.
- **Fence interiors are inert** -- this applies equally to the `current:` fence and the `draft:` fence. Inside either fence: bare markers, checkbox-shaped lines (`- [ ] ...`), and `#tag`s are **never** parsed as structure (no marker recognition, no tick-counting, no fold-target scan). This amends the v2 tick-scoping clause ("never the draft-fence interior") to read **"never the interior of any fence (current or draft)."**
- **Marker present, fence absent.** A `draft:` marker (for `new-rule`/`strengthen`) or a `current:` marker with **no following fence** before the next marker / EOF is the missing-fence case -> **malformed** (reported, skipped). This is the marker-anchored restatement of v1's positional "missing/unterminated draft fence -> malformed", now covering `current:` symmetrically.
- The checkbox tick-counting block remains the contiguous tick/blank run **immediately following the `decision:` marker** (v2), unaffected by `current:`/`draft:` which precede it.
- A **missing** `current:` marker is **never malformed** -- it is the valid representation of "no before" (new-rule, text-unchanged rehome/reowner) and a defensive guard so a generator omission cannot brick an otherwise-applyable entry. Apply emits **no note and no error** about a missing `current:` (it never reads the block; C3/C4).
- A `current:` marker that is **present** must be followed by a well-formed fenced block (matched open/close under the v1 fence grammar); a malformed/unterminated `current:` fence -> malformed entry (reported, skipped), consistent with `draft:`.
- Everything from v1/v2 holds (duplicate-tag, draft-fence grammar, checkbox grammar, `decisionText` `<!-- apply-log -->` sentinel split, `\r?\n`).

## Apply pipeline changes

None to behavior. A3/A4 are unchanged: disposition from the ticked box, params from the `decisionText` human part, ensure-end-state from `draft` (located by its marker per C0), report buckets identical. Apply gains no awareness of `current:`.

## Migration

Re-convert the existing `.agentsmith/instruction-review/triage.md` (32 entries: 23 `strengthen`, 9 `new-rule`; all currently `park`, no ticks):

- For each **`strengthen`** entry: read its `- targetFile:`, extract the live section by the §"Section extraction" rule (match `^## #<tag>(\s|$)`, where `<tag>` is the entry's tag with a leading `#`), and insert a fenced `current:` block immediately before that entry's `draft:` marker. The fence width follows the v1 rule -- **more backticks than any fence inside the extracted section** (a 4-backtick fence suffices for all 23 live sections; none contains a 4-backtick fence), not an unconditional constant.
- For each **`new-rule`** entry: no change.
- All decisions (`park`, no ticks) and `decisionText` bodies are preserved untouched. No re-running of the round.
- If a `strengthen` entry's tag is not found in its `targetFile` by the anchored match (tag moved/renamed since the round), the migration **omits** `current:` for that entry and **logs** it -- never inserts a guessed or empty block.

The migration also confirms each entry already carries a literal `draft:` label line (it does, per v1 §1.2); no draft-marker insertion is needed -- C0 only makes the existing line authoritative.

## Acceptance criteria

1. After migration, every `strengthen` entry has a `current:` fenced block (verbatim live section, extracted by the `^## #<tag>` rule) immediately before its `draft:`; every `new-rule` entry has none; all decisions/`decisionText` are unchanged; the checkbox sets remain none-ticked.
2. Apply locates the draft by the **`draft:` marker** (not fence position): an entry with `current:` before `draft:` adopts the **draft**, never the `current:` snapshot. (Direct test of C0; would fail under the old positional rule.)
3. Ticking one box and running `/instruction-apply` behaves exactly as in v2 -- `current:` does not alter disposition, params, the end-state edit, idempotency, or the report buckets. Removing all `current:` blocks changes no apply outcome.
4. A `current:` block whose snapshot differs from the now-live source still applies correctly (apply ignores `current:` and re-reads the live source for the strengthen replace); no staleness error.
5. Two bare `current:` markers (or two `draft:` markers) in one entry, or a malformed/unterminated `current:` fence, -> malformed entry (reported, skipped). A **missing** `current:` is **not** malformed and produces no note.
6. Bare markers, `- [ ] adopt`-shaped lines, and `#tag`s **inside** a `current:` fence are inert -- no marker recognition, tick-counting, or fold parsing -- identical to the draft fence.
7. The `current:` snapshot for a `strengthen` matches the section apply's A3 would replace (same `## #tag ... -> next ## / EOF` delimiter), byte-for-byte **after the same `\r?\n` normalization A1/A3 apply** (the snapshot is copied verbatim; equivalence is defined modulo line endings, since the repo is Windows / `\r\n`), so a render of current-vs-draft reflects the real change.
8. Everything in v1/v2 not changed here still holds (gate, checkbox decision, `decisionText` + sentinel, idempotent ensure-end-state, per-entry snapshot recovery, decisions-log format, crash resumability, the v2 acceptance set) -- except the positional draft-locate rule, which C0 supersedes.

## Out of scope (plan)

- The SKILL.md edits: step-5 worksheet-format prose (add `current:` to the entry shape + placement; promote `draft:` to a bare marker per C0), `instruction-editor` generation note (copy the verbatim section for strengthen), and the A1 parse-contract additions (bare `current:`/`draft:` markers, fence-interior inertness for both fences, `^## #<tag>` extraction).
- `proposal-format.md` worksheet-shape update; the command-description touch-ups if any enumerate the entry fields.
- The one-time migration of the live `triage.md` (23 strengthen sections fetched).
- Any rendered diff (C5) -- not built as part of this spec.
- No new `#tag`, no `ownership.yaml` change, no JS in the generator.
