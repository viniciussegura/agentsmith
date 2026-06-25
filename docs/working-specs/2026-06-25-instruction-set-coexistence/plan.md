# Instruction-set coexistence Implementation Plan

Status: Implemented

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the generated instruction set state how it coexists with a project-scoped instruction file, close the deep-modules gap, and steer downstream authors away from paraphrase drift.

**Architecture:** Edit canonical sources under `instructions/` (preamble + two rules + one new rule + one ownership row) and add consumer guidance to `README.md`; then regenerate the committed `AGENTS.md` artifacts and gate on the test suite. All behavior flows from the sources — `AGENTS.md` is generated, never hand-edited.

**Tech Stack:** Node ESM, `node --test`, the agentsmith generator (`bin/cli.js`, `src/`), Markdown instruction sources, YAML ownership map.

## Global Constraints

- Instruction prose style: terse, normative, `#tag` cross-references in backticks; mirror existing rule files (h1 `# #tag Title`, short paragraphs/bullets). One rule = one file.
- Every new `#tag` forces exactly one `ownership.yaml` row; the coverage lint fails CI on any orphan/duplicate/unresolved owner.
- Every `#tag` referenced in prose must resolve to a defined rule, or the generator emits a dangling-tag warning (gated by `test/instruction-integrity.test.mjs`).
- Never hand-edit `AGENTS.md` / `.agentsmith/AGENTS.md` — regenerate from sources.
- Precedence decision (from spec): a project-scoped file wins on conflict, EXCEPT the safety baseline `#git-secret-history`, `#ai-untrusted-content`, `#swe-security`, `#ai-tool-safety`, which a project may tighten but not waive.
- Work stays on branch `feat/instruction-set-coexistence` (already checked out). Never commit to `main`.

---

### Task 1: New rule `#swe-deep-modules` + ownership row

**Files:**
- Create: `instructions/core/swe/swe-deep-modules.md`
- Modify: `instructions/ownership.yaml` (add one row under the `# swe` block)
- Test (existing gate, no new test file): `test/instruction-integrity.test.mjs`

**Interfaces:**
- Consumes: existing tags `#swe-public-surface-docs`, `#swe-errors`, `#swe-decomposition` (all already defined — cross-refs must resolve).
- Produces: new tag `#swe-deep-modules`, owned by `swe`. Later prose/rules may reference it.

- [ ] **Step 1: Write the rule file**

Create `instructions/core/swe/swe-deep-modules.md` with exactly:

```markdown
# #swe-deep-modules Deep modules

Favor deep modules: a simple interface over a substantial implementation. The surface a caller must understand stays small relative to the functionality it hides (#swe-public-surface-docs).
- Hide implementation detail behind the interface; pull complexity downward so callers carry less of it.
- Define errors out of existence where you can: shape the interface so a class of error cannot arise, rather than exposing it for every caller to handle (#swe-errors).
- A shallow module -- interface nearly as complex as its body -- adds cost without hiding much; collapse it or deepen it.

This complements #swe-decomposition: decomposition says *when* to split a unit by responsibility; this says *what a good boundary looks like* once split. See "A Philosophy of Software Design" (Ousterhout).
```

- [ ] **Step 2: Add the ownership row**

In `instructions/ownership.yaml`, under the `# swe -- base lens` block, add after the `swe-decomposition: swe` line:

```yaml
  swe-deep-modules: swe
```

- [ ] **Step 3: Run the integrity gate to verify it fails before the row, passes after**

Run: `node --test test/instruction-integrity.test.mjs`
Expected: PASS — both subtests green (ownership clean; no dangling-tag warning). If the ownership row was omitted, the ownership subtest fails with `orphans: swe-deep-modules`; if a cross-ref tag were misspelled, the dangling-tag subtest fails.

- [ ] **Step 4: Commit the sources**

```bash
git add instructions/core/swe/swe-deep-modules.md instructions/ownership.yaml
git commit -m "feat(instructions): add #swe-deep-modules rule"
```

---

### Task 2: Precedence chain in the preamble

**Files:**
- Modify: `instructions/main.md`
- Test (existing gate): `test/instruction-integrity.test.mjs`

**Interfaces:**
- Consumes: existing safety tags `#git-secret-history`, `#ai-untrusted-content`, `#swe-security`, `#ai-tool-safety` (all defined — must resolve).
- Produces: the document-wide precedence statement; Task 3's per-rule pointers reference "preamble precedence".

- [ ] **Step 1: Replace the conversation-only precedence line**

In `instructions/main.md`, replace this line:

```markdown
User instructions in the active conversation override this file.
```

with:

```markdown
Precedence on conflict: user instructions in the active conversation > a more project-specific instruction file > this file.
A project-scoped instruction file may override any rule here -- except the safety baseline (#git-secret-history, #ai-untrusted-content, #swe-security, #ai-tool-safety), which a project may tighten but not waive.
```

- [ ] **Step 2: Run the integrity gate**

Run: `node --test test/instruction-integrity.test.mjs`
Expected: PASS — the four safety `#tag`s referenced in the preamble resolve, so no dangling-tag warning.

- [ ] **Step 3: Commit**

```bash
git add instructions/main.md
git commit -m "feat(instructions): state project-file precedence with a safety floor"
```

---

### Task 3: Per-rule reconciliation pointers

**Files:**
- Modify: `instructions/core/code/code-style.md`
- Modify: `instructions/core/ai/ai-conversational.md`
- Test (existing gate): full suite in Task 5.

**Interfaces:**
- Consumes: the preamble precedence statement from Task 2 (referenced in prose, not as a `#tag`).
- Produces: no new tags.

- [ ] **Step 1: Add the comment-style pointer**

In `instructions/core/code/code-style.md`, append a bullet to the existing list (after the formatter/linter bullet):

```markdown
- A project instruction file may opt into a heavier comment style; where it does, defer to it (see preamble precedence).
```

- [ ] **Step 2: Add the citation + survey pointers**

In `instructions/core/ai/ai-conversational.md`, append two bullets to the existing list:

```markdown
- If a project defines its own rule-citation convention, adopt it instead of stacking `#tag` citations on top -- don't double-tag.
- Give a recommendation, not an exhaustive survey; enumerate options only for genuinely open choices, not as a per-task ritual.
```

- [ ] **Step 3: Verify the generator runs clean**

Run: `node bin/cli.js --stdout > /dev/null`
Expected: exit 0, no `warning --` lines on stderr.

- [ ] **Step 4: Commit**

```bash
git add instructions/core/code/code-style.md instructions/core/ai/ai-conversational.md
git commit -m "feat(instructions): add project-coexistence pointers to #code-style and #ai-conversational"
```

---

### Task 4: Downstream drift guidance in README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: consumer-facing guidance only; not part of the instruction set, no tag.

- [ ] **Step 1: Locate the consumer-guidance section**

Run: `grep -n "consumer\|project\|AGENTS.md" README.md | head -20`
Expected: find the section that talks about how a consumer repo uses the generated `AGENTS.md` (near the line "agentsmith only produces the file."). Add the new note immediately after that paragraph.

- [ ] **Step 2: Add the drift-avoidance note**

Insert this paragraph after the "agentsmith only produces the file." paragraph in `README.md`:

```markdown
**Coexisting with a project instruction file.** A project may ship its own instruction file alongside the generated set; on conflict the project file wins (except the safety baseline). When a project file restates a rule the generated set already owns, reference its `#tag` rather than paraphrasing it -- a paraphrase silently goes stale when the canonical rule is edited.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): guidance on coexisting project files and tag references"
```

---

### Task 5: Regenerate committed artifacts + full gate

**Files:**
- Modify (generated, do not hand-edit): `AGENTS.md`, `.agentsmith/AGENTS.md`, and any `.agentsmith/` bundle files the generator refreshes.

**Interfaces:**
- Consumes: all source edits from Tasks 1-4.
- Produces: regenerated instruction artifacts matching the sources.

- [ ] **Step 1: Regenerate the nested artifact set**

Run: `node bin/cli.js`
Expected: stderr `agentsmith: wrote .agentsmith/AGENTS.md` (plus any bundle files). The root `AGENTS.md` stub is kept if it already exists.

- [ ] **Step 2: Regenerate the root artifact**

Run: `node bin/cli.js --root`
Expected: stderr `agentsmith: wrote AGENTS.md`.

- [ ] **Step 3: Confirm the diff is exactly the intended content**

Run: `git --no-pager diff --stat && git --no-pager diff AGENTS.md | grep -n "swe-deep-modules\|Precedence on conflict\|double-tag\|heavier comment style"`
Expected: `AGENTS.md` (and `.agentsmith/AGENTS.md`) changed; the grep shows the new rule heading, the precedence line, and the two pointer phrases now present in the generated output. Only header revision stamps and the intended content should differ — scan the diff to confirm no unrelated churn.

- [ ] **Step 4: Run the full test suite**

Run: `node --test`
Expected: all tests pass (ownership coverage, dangling-tag/lean-split gates, build, cli, triage, review — everything green).

- [ ] **Step 5: Commit the regenerated artifacts**

```bash
git add AGENTS.md .agentsmith/
git commit -m "chore(instructions): regenerate AGENTS.md for coexistence + deep-modules"
```

---

## Notes for the implementer

- If `node bin/cli.js --root` overwrites the root `AGENTS.md` with a different layout than what is currently committed (e.g. lean vs full inline), match the **currently committed** layout: inspect `git diff AGENTS.md` and, if the structure (not just the new content) changed, re-run with the flag that reproduces the committed structure (`--full`/`--inline` produce the inline layout; default is lean). The goal is: same artifact shape as before, plus the new content.
- `/dev/null` in Task 3 Step 3 is fine under the Bash (Git Bash) tool; under PowerShell use `$null`.
