# Spec-review specialist fan-out — Implementation Plan

Status: Draft

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make spec auto-review the **third application of `#ai-review-engine`**: a generalist (`spec-specialist`) routes to + converges a curated fan-out of cheap, reconciling domain specialists drawn from the shared role registry, with the convergence-guard math pulled into a zero-dependency `guard.mjs`. No forked personas; token-conscious per the review-board cost work.

**Architecture:** One new script (`guard.mjs`) carries all deterministic state (ledger merge, `b(n)`, best/stall/cap, `--new-cycle`). Everything else is prose wiring over existing engine parts: a curated `spec_review:` flag in `roles.yaml`, a third schema arm in `reviewer-common.md`, JSON scratch shapes in `finding-format.md`, the converge+route responsibilities added to `spec-specialist.md`, and the per-round pipeline in `spec-review/SKILL.md`. Instruction prose (`ai-spec-review.md`, `ai-review-engine.md`) updated and `AGENTS.md` regenerated.

**Tech Stack:** Node ESM, zero runtime deps, `node:test`. Skill/agent files under `tools/claude/` (shippable; installed via `node bin/cli.js --dev`). Instructions under `instructions/` (generated into `AGENTS.md`). Spec: `docs/working-specs/2026-06-24-spec-review-specialist-fanout/spec.md`.

**Key interface — `guard.mjs` (frozen by Task 1's tests):**
`node guard.mjs <scratch-dir> <n> [--new-cycle]` reads `ledger.json` (inits if absent) + `round-<n>.review.json` (+ `round-<n>.rebuttal.json` if present), merges the review into the ledger (upsert by id; generalist-set `tag` authoritative; `origin`/`roundRaised` preserved; `tagHistory` appended on tag change), folds rebuttal `status`, computes `b(n)` (rows `blocking` ∧ `open`), evaluates the guard, writes `ledger.json`, prints a one-line verdict (`converged`/`stalled`/`cap`/`continue`) + `b(n)` + `best`. The generalist owns `tag`; the author owns `status`; `guard.mjs` never invents either and fails closed (exit ≠ 0) on a finding missing `origin`/`tag` or malformed JSON.

---

## File structure

- `tools/claude/skills/spec-review/guard.mjs` (new) — ledger merge + convergence guard.
- `instructions/roles.yaml` — add curated `spec_review:` boolean per role + header note.
- `tools/claude/skills/spec-review/finding-format.md` — JSON scratch shapes (Finding, `findings/<role>.json`, `round-<n>.review.json`, `routing-<n>.json`, `round-<n>.rebuttal.json`, `ledger.json`); `origin`/`tag`/`tagReason`/`tagHistory`; reconcile semantics.
- `tools/claude/skills/review-board/reviewer-common.md` — Subject/Schema/Output third (spec-review) arm.
- `tools/claude/agents/spec-specialist.md` — ingest specialist scratch, converge (own tag, down-tag, never status), emit `routing-<n+1>.json`.
- `tools/claude/skills/spec-review/SKILL.md` — rewrite loop to the per-round pipeline (bootstrap/route → cheap fan-out → converge → `guard.mjs` → revise).
- `instructions/core/ai/ai-spec-review.md`, `instructions/core/ai/ai-review-engine.md` — protocol prose (two → three applications; generalist converges a curated fan-out; in-loop reduce).
- `README.md`, `docs/future-work/` — docs drift.
- Tests: new `test/spec-review-guard.test.js`; new `test/spec-review-structural.test.js` (roles.yaml flag + reviewer-common third arm + persona no-fork).

---

## Task 1: `guard.mjs` — ledger merge + convergence guard

**Files:**
- Create: `tools/claude/skills/spec-review/guard.mjs`
- Test: new `test/spec-review-guard.test.js`

This is the only logic in the feature; build it first so the SKILL pipeline (Task 6) wires a frozen interface.

- [ ] **Step 1: Write failing tests**

Create `test/spec-review-guard.test.js`. Use a temp scratch dir per test; write the input JSON, run the script via `execFileSync('node', [guardPath, dir, n, ...flags])`, read back `ledger.json` + parse the printed verdict. Cover:

```text
// merge + b(n)
- empty ledger + a review with 2 blocking + 1 nit  → ledger has 3 findings, b=2, verdict 'continue'.
- a blocking finding missing `origin` (or `tag`)    → non-zero exit (fails closed).
- recurring id re-emitted with a changed tag        → tag updated, tagHistory appended (2 entries), origin/roundRaised preserved.
- recurring id NOT re-emitted in the review         → ledger tag unchanged (reconcile-preservation falls out: guard only retags on re-emission).

// tag authority
- generalist down-tag blocking→nit + tagReason      → finding leaves b(n); status stays 'open'; tagHistory records it.
- guard never writes a status (no rebuttal present) → all merged findings status 'open'.

// status (author)
- rebuttal sets id→resolved                          → that id drops out of b(n); ledger status 'resolved'.
- rebuttal sets id→wontfix                           → drops out of b(n); status 'wontfix'.

// openBlocking cross-check
- review.openBlocking disagrees with computed b(n)   → warning on stderr, exit 0, ledger b(n) authoritative.

// guard order (first-match-wins), driven by meta across calls in one dir
- b=0                                                → 'converged'.
- two consecutive non-progress reviews in a cycle    → 'stalled' (earliest the 3rd review; a progress review resets the streak).
- 5 rounds in a cycle without converge/stall         → 'cap'.

// cycle reset
- `--new-cycle` resets meta.cycle++, roundsInCycle=0, best=null; round count + best restart.
```

- [ ] **Step 2: Run, verify they fail**

Run: `node --test test/spec-review-guard.test.js`
Expected: FAIL (`guard.mjs` does not exist).

- [ ] **Step 3: Implement `guard.mjs`**

Zero-dependency Node ESM, JSON via built-ins, mirroring `review-board/persist.mjs` discipline (deterministic, fails closed). Sketch:

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [dir, nRaw, ...flags] = process.argv.slice(2);
const n = Number(nRaw);
const newCycle = flags.includes('--new-cycle');
const die = (m) => { process.stderr.write(`guard: ${m}\n`); process.exit(1); };
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { die(`bad JSON ${p}: ${e.message}`); } };

const ledgerPath = join(dir, 'ledger.json');
const ledger = existsSync(ledgerPath)
  ? readJson(ledgerPath)
  : { meta: { cycle: 1, roundsInCycle: 0, best: null, nonProgressStreak: 0 }, findings: [] };
if (newCycle) ledger.meta = { cycle: ledger.meta.cycle + 1, roundsInCycle: 0, best: null, nonProgressStreak: 0 };

const review = readJson(join(dir, `round-${n}.review.json`));
const byId = new Map(ledger.findings.map((f) => [f.id, f]));
for (const f of review.findings ?? []) {
  if (!f.origin || !f.tag) die(`finding ${f.id ?? '?'} missing origin/tag`);
  const cur = byId.get(f.id);
  if (!cur) {
    const e = { id: f.id, origin: f.origin, tag: f.tag, tagReason: f.tagReason, problem: f.problem, fix: f.fix,
      status: 'open', roundRaised: n, tagHistory: [{ round: n, tag: f.tag, by: f.origin, reason: f.tagReason }] };
    byId.set(f.id, e); ledger.findings.push(e);
  } else if (cur.tag !== f.tag) {
    cur.tagHistory.push({ round: n, tag: f.tag, by: 'generalist', reason: f.tagReason });
    cur.tag = f.tag; if (f.tagReason) cur.tagReason = f.tagReason;
  }
  // unre-emitted ids keep their ledger tag (reconcile preservation, by omission)
}

const rebuttalPath = join(dir, `round-${n}.rebuttal.json`);
if (existsSync(rebuttalPath)) {
  const reb = readJson(rebuttalPath);
  for (const [id, { status }] of Object.entries(reb.statuses ?? {})) {
    const cur = byId.get(id); if (cur && (status === 'resolved' || status === 'wontfix')) cur.status = status;
  }
}

const b = ledger.findings.filter((f) => f.tag === 'blocking' && f.status === 'open').length;
if (review.openBlocking != null && review.openBlocking !== b)
  process.stderr.write(`guard: openBlocking ${review.openBlocking} != computed b(${n})=${b}; using ${b}\n`);

const m = ledger.meta; m.roundsInCycle += 1;
const firstReview = m.best === null;
const progress = firstReview || b < m.best;
let verdict;
if (b === 0) verdict = 'converged';
else { m.nonProgressStreak = progress ? 0 : m.nonProgressStreak + 1;
  if (m.nonProgressStreak >= 2) verdict = 'stalled';
  else if (m.roundsInCycle >= 5) verdict = 'cap';
  else verdict = 'continue'; }
m.best = firstReview ? b : Math.min(m.best, b);

writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
process.stdout.write(`${verdict} b(${n})=${b} best=${m.best}\n`);
```

Match the guard order to `#ai-spec-review` exactly (converged → stalled → cap → continue; stall = two consecutive non-progress, earliest the 3rd review; progress resets the streak; `best := min` after the checks). Verify the streak/best update order against the spec's "update best **after** the checks."

- [ ] **Step 4: Run, verify pass**

Run: `node --test test/spec-review-guard.test.js`
Expected: PASS (all merge/tag/status/guard/cycle cases).

- [ ] **Step 5: Commit**

```bash
git add tools/claude/skills/spec-review/guard.mjs test/spec-review-guard.test.js
git commit -F - <<'EOF'
🤖 feat(spec-review): guard.mjs — ledger merge + convergence guard

Zero-dependency script carrying all deterministic spec-review state: upsert the
generalist's converged round review into ledger.json (generalist-set tag
authoritative, origin/roundRaised preserved, tagHistory on tag change), fold
author rebuttal statuses, compute b(n) (blocking∧open), and evaluate the
unchanged convergence guard (converged/stalled/cap/continue) with per-cycle
best + --new-cycle reset. Fails closed on missing origin/tag or malformed JSON.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: Curated `spec_review:` flag in `roles.yaml`

**Files:**
- Modify: `instructions/roles.yaml`
- Test: new `test/spec-review-structural.test.js`

- [ ] **Step 1: Write failing tests**

Create `test/spec-review-structural.test.js` with the roles assertions (more added in Task 4):

```text
- every role row carries a boolean `spec_review`.
- the curated set is exactly: db, security, frontend, ux, qa, docs → true; swe, correctness, ai, git → false.
```

Parse `roles.yaml` minimally (the repo already reads its single-scalar config with a small regex elsewhere; reuse that style — a per-line `^\s*(\w+):\s*\{.*spec_review:\s*(true|false)` scan is sufficient and dependency-free).

- [ ] **Step 2: Run, verify fail**

Run: `node --test test/spec-review-structural.test.js`
Expected: FAIL (no `spec_review` key present yet).

- [ ] **Step 3: Implement**

Add `spec_review:` to each role row in `instructions/roles.yaml` per the spec's curated table (db/security/frontend/ux/qa/docs `true`; swe/correctness/ai/git `false`). Extend the header comment block to document `spec_review` alongside `instruction_review` (a role may join one, both, or neither; spec review's generalist subsumes swe/correctness, meta-lenses ai/git are excluded). `ownership.yaml`/composition untouched.

- [ ] **Step 4: Run, verify pass**

Run: `node --test test/spec-review-structural.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add instructions/roles.yaml test/spec-review-structural.test.js
git commit -F - <<'EOF'
🤖 feat(roles): curated spec_review flag for the third engine application

Each role declares spec_review (independent of instruction_review): db, security,
frontend, ux, qa, docs participate in spec review; swe/correctness fold into the
generalist; meta-lenses ai/git are excluded. The generalist's consult menu is
roles.yaml filtered to spec_review:true — no second hand-maintained list.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: JSON scratch shapes in `finding-format.md`

**Files:**
- Modify: `tools/claude/skills/spec-review/finding-format.md`

Pure documentation of the contract Task 1 already encodes in code + tests. No new unit test (Task 1's fixtures are the executable schema); the structural suite stays green.

- [ ] **Step 1: Implement**

Replace/extend `finding-format.md` to carry the spec's **Scratch JSON shapes** verbatim-in-spirit: the Finding object (`id`, `origin`, `tag`, `tagReason?`, `problem`, `fix`); `findings/<role>.json` (`new` + `reconcile`, reconcile carries **no tag**, `transition` is advisory and never auto-sets status); `round-<n>.review.json` (`findings` + informational `openBlocking`); `routing-<n>.json` (`forRound`, `lenses`, `questions`); `round-<n>.rebuttal.json` (`statuses`, author-only); `ledger.json` (`meta{cycle,roundsInCycle,best,nonProgressStreak}` + `findings[]` with `status`/`roundRaised`/`tagHistory`). Keep the existing human-facing ledger-table description as the rendered view; note the machine artifact is JSON. State the tag/status authority split (generalist→tag, author→status) at the top.

- [ ] **Step 2: Run, verify suite green**

Run: `node --test`
Expected: PASS (doc-only; Task 1 + Task 2 tests unaffected).

- [ ] **Step 3: Commit**

```bash
git add tools/claude/skills/spec-review/finding-format.md
git commit -F - <<'EOF'
🤖 docs(spec-review): JSON scratch shapes + tag/status authority

finding-format.md documents the machine artifacts guard.mjs reads/writes
(Finding, findings/<role>.json, round-<n>.review.json, routing-<n>.json,
rebuttal, ledger incl. meta), the reconcile-carries-no-tag rule, the advisory
transition field, and the generalist-owns-tag / author-owns-status split.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: `reviewer-common.md` third (spec-review) arm

**Files:**
- Modify: `tools/claude/skills/review-board/reviewer-common.md`
- Test: extend `test/spec-review-structural.test.js`

- [ ] **Step 1: Write failing assertion**

Add to `test/spec-review-structural.test.js`:

```text
- reviewer-common.md Subject clause names a spec (a third subject arm beyond diff/instruction set).
- reviewer-common.md Schema clause names `Finding` (pointer to spec-review/finding-format.md).
- no review-<role>.md persona contains spec-specific text (artifact-neutrality preserved across all tools/claude/agents/review-*.md).
```

- [ ] **Step 2: Run, verify fail**

Run: `node --test test/spec-review-structural.test.js`
Expected: FAIL (reviewer-common still two-arm).

- [ ] **Step 3: Implement**

Extend `reviewer-common.md` three clauses: **Subject** (“…or a spec (spec review)”), **Schema** (add the `Finding` arm → `spec-review/finding-format.md`), **Output** (schema-routing sentence covers spec review’s `findings/<role>.json`; the path token already matches). Confirm no `review-<role>.md` persona needs a content change (the no-fork assertion must pass without editing personas).

- [ ] **Step 4: Run, verify pass**

Run: `node --test test/spec-review-structural.test.js && node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/claude/skills/review-board/reviewer-common.md test/spec-review-structural.test.js
git commit -F - <<'EOF'
🤖 feat(review-engine): reviewer-common third arm for spec review

Subject/Schema/Output clauses gain the spec-review arm (subject=a spec,
schema=Finding) so a domain specialist spawned for spec review is never routed
to a code-review schema. Personas stay artifact-neutral (no fork); a structural
test asserts no review-<role>.md carries spec-specific text.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: `spec-specialist.md` — converge + route

**Files:**
- Modify: `tools/claude/agents/spec-specialist.md`

Prose persona change; no unit test (the agent's behavior is exercised by the post-build dogfood in Verification). Suite stays green.

- [ ] **Step 1: Implement**

Extend `spec-specialist.md`: keep its adversarial cross-cutting lens (coherence/contradiction/testability/scope, subsuming swe/correctness at spec altitude) and add two responsibilities — (a) **converge**: ingest each consulted specialist's `findings/<role>.json`, dedup/reframe, preserve `origin` + ids, set each finding's `tag`, and **down-tag** a specialist blocker to nit with a `tagReason` when warranted — but **never write a status** (`resolved`/`wontfix` stay the author's); (b) **route**: emit `routing-<n+1>.json` (next-round `lenses` from the curated `spec_review:true` menu + per-lens directed `questions`). Output is `round-<n>.review.json` + `routing-<n+1>.json`; no prose narrated back (path + open-blocking count only). It already has Read/Grep/Glob (enough to read scratch).

- [ ] **Step 2: Run, verify suite green**

Run: `node --test`
Expected: PASS (no-fork assertion unaffected — `spec-specialist` is not a `review-<role>` persona).

- [ ] **Step 3: Commit**

```bash
git add tools/claude/agents/spec-specialist.md
git commit -F - <<'EOF'
🤖 feat(spec-review): spec-specialist converges + routes the fan-out

The generalist now ingests consulted specialists' scratch findings and converges
them (preserve origin+ids, own the tag, may down-tag a specialist blocker to nit
with a reason, never writes a status) and emits routing-<n+1>.json (next-round
curated lenses + directed questions). It is the engine's reduce, run in-loop.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 6: `spec-review/SKILL.md` — per-round pipeline

**Files:**
- Modify: `tools/claude/skills/spec-review/SKILL.md`

The orchestration rewrite. Prose; verified by the dogfood. Keep the degradation clause (sub-agents unavailable → role-play; scripts unavailable → hand-compute the guard).

- [ ] **Step 1: Implement**

Rewrite the **Loop** to the spec's per-round pipeline: (1) select specialists — read `routing-<n>.json` (round 1: driver writes the bootstrap `routing-1.json`; round n≥2: the generalist's `routing-<n>.json` from the prior round), re-intersect with curated `spec_review:true`, first-consult detection by `snapshots/<role>.md` presence, compute the per-lens diff for re-consults; (2) cheap parallel specialist fan-out writing `findings/<role>.json` (path+count only), then overwrite snapshots; (3) strong generalist converge writing `round-<n>.review.json` + `routing-<n+1>.json`; (4) `node guard.mjs <scratch-dir> <n> [--new-cycle]`; (5) act on the printed verdict; (6) author revise + `round-<n>.rebuttal.json`. Add the **Token discipline** section (cheap+parallel specialists, scripted guard, strong reserved for converge, reconcile-not-rescan, no summary-projection disclaimer) and the **scratch layout** (incl. `snapshots/`, `routing-<n>.json`). Per `#ai-conversational`, the spawn prompts state explicit model ids (specialists cheap; generalist stronger). Reference `#ai-review-engine` (parent) + `#ai-spec-review` (protocol).

- [ ] **Step 2: Run, verify suite green + skill installs**

Run: `node --test && node bin/cli.js --dev`
Expected: suite PASS; the `--dev` install lays `spec-review/{SKILL.md,finding-format.md,guard.mjs}` + `spec-specialist.md` into `.claude/` without error.

- [ ] **Step 3: Commit**

```bash
git add tools/claude/skills/spec-review/SKILL.md
git commit -F - <<'EOF'
🤖 feat(spec-review): per-round pipeline driving the specialist fan-out

SKILL.md rewrites the loop to: bootstrap/route → cheap parallel specialist
fan-out (JSON scratch, path+count) → strong generalist converge (review +
routing directive) → guard.mjs → author revise. Adds the snapshot-based
dirtiness gate, the scratch layout, explicit per-spawn model ids, and the
token-discipline section. Degrades to role-play / hand-computed guard.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 7: Instruction prose + regenerate `AGENTS.md`

**Files:**
- Modify: `instructions/core/ai/ai-spec-review.md`, `instructions/core/ai/ai-review-engine.md`
- Regenerate: `AGENTS.md` (via the generator)

- [ ] **Step 1: Implement**

- `ai-spec-review.md`: the reviewer step is now a **generalist that converges a curated specialist fan-out**; specialists are reconciling lenses from the shared registry; the convergence guard is unchanged and reads the single converged ledger; specialist blockers carry their own ids and leave the open-blocking set only by a generalist down-tag (tag) or an author `resolved`/`wontfix` (status). State that spec review is an application of `#ai-review-engine`.
- `ai-review-engine.md`: change “one pipeline, **two applications**” → **three** (code review, instruction review, spec review); note spec review's distinguishing traits — the reduce runs **in-loop** (generalist converges each round) and role selection is the generalist's **semantic routing**, not path-glob gating.

- [ ] **Step 2: Regenerate + verify**

Run:
```bash
node bin/cli.js          # regenerate AGENTS.md from instructions
node --test
```
Expected: generator clean; `AGENTS.md` reflects the three-application engine + the updated spec-review protocol; suite green. Stage the regenerated `AGENTS.md` if the repo tracks it (it does — confirm `git status`).

- [ ] **Step 3: Commit**

```bash
git add instructions/core/ai/ai-spec-review.md instructions/core/ai/ai-review-engine.md AGENTS.md
git commit -F - <<'EOF'
🤖 docs(instructions): spec review is engine application #3

ai-review-engine: two → three applications; spec review's reduce runs in-loop and
selects lenses by the generalist's semantic routing (not path-glob gating).
ai-spec-review: the reviewer is a generalist converging a curated specialist
fan-out; specialist blockers carry own ids, left only by generalist down-tag or
author status. Regenerated AGENTS.md.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 8: Docs drift + final verification (the dogfood acceptance)

**Files:**
- Modify: `README.md`
- Create: `docs/future-work/2026-06-24-spec-review-learned-routing.md`

- [ ] **Step 1: README + future-work**

- `README`: note spec review is now an application of the role-based review engine (curated specialist fan-out), alongside code review and instruction review.
- `docs/future-work/2026-06-24-spec-review-learned-routing.md` (`#swe-future-work`): if the round-1 bootstrap classifier proves weak, the generalist proposes the round-1 set from a dry pass (“learned routing”) — deferred.

- [ ] **Step 2: Full suite + generators**

Run:
```bash
node bin/cli.js && node bin/cli.js --dev && node --test
```
Expected: generator + `--dev` install clean; full suite green (`spec-review-guard`, `spec-review-structural`, plus the pre-existing review-board/tools/cli suites unaffected).

- [ ] **Step 3: Dogfood acceptance (the feature reviewing with the new mechanism)**

Run the **new** spec-review pipeline on a throwaway spec with a deliberate data-model gap (e.g. an unspecified migration story). Confirm:
- the `db` lens is routed in and raises a `db`-origin **blocking** finding a generalist-only run misses (the feature's reason to exist);
- the generalist converges; `guard.mjs` drives the loop and prints the verdict;
- a specialist blocker the generalist down-tags to nit leaves `b(n)` yet remains an `open` row with `origin` + `tagHistory` intact (audit trail);
- on convergence (`b=0`) the loop presents the final spec.

(Per the spec, this is distinct from the round-3 spec-content dogfood already done with the *old* single-reviewer loop.)

- [ ] **Step 4: Commit + advance spec Status**

```bash
git add README.md docs/future-work
git commit -F - <<'EOF'
🤖 docs: spec review as engine application #3 (README + future-work)

README documents the three-application engine; future-work logs learned routing
as deferred. Closes the spec-review specialist fan-out work.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

Then advance the spec's `Status:` line to `Implemented` (a permitted post-Approved status advance per `#ai-plan`) and this plan's `Status` likewise, in a final docs commit.

---

## Self-review

**Spec coverage:** G1 (engine application #3) — Tasks 4–7; G2 (curated `spec_review`) — Task 2; G3 (generalist judge + converge, guard unchanged) — Tasks 1, 5; G4 (reconciling specialists, dirtiness gate) — Task 6; G5 (token-conscious: cheap fan-out, scripted guard, strong-only converge) — Tasks 1, 6; G6 (degradation) — Task 6. Every spec section (Routing, Convergence, Scratch shapes, Pipeline, Edge cases, Tests, Token discipline) maps to a task.

**Ordering / TDD:** Task 1 (`guard.mjs`, the only logic) is fully TDD and frozen first; Task 2/4 carry structural tests; Tasks 3/5/6/7/8 are prose over the now-frozen interface, each gated by `node --test` staying green and (6/8) a clean `--dev` install. No task depends on a later one.

**Testable vs manual:** `guard.mjs` (unit), `roles.yaml` flag + `reviewer-common` third arm + persona no-fork (structural) are automated. The orchestration prose (SKILL/spec-specialist) and the routing/converge behavior are verified by the Task 8 dogfood — they cannot be unit-tested without spawning sub-agents.

**Consistency:** tag/status authority split (generalist→tag, author→status) is identical across `guard.mjs` (Task 1), `finding-format.md` (Task 3), `spec-specialist.md` (Task 5), and `ai-spec-review.md` (Task 7). The `routing-<n>.json` uniform scheme and the snapshot-presence dirtiness gate appear only where the spec places them (SKILL Task 6). `--new-cycle` is the sole cycle-reset signal everywhere.

**Residual manual-only steps:** the dogfood acceptance (Task 8 Step 3) and the `--dev` install smoke (Tasks 6/8) require a live host; logged as manual, not unit tests.
