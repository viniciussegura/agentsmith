# Spec: Spec-review specialist fan-out (engine application #3)

Date: 2026-06-24
Status: Approved
Review: spec-review converged at round 3 (`b`-trajectory 5 -> 3 -> 0, progress every round, no stall). All blockers + nits resolved; no open blockers.

## Motivation

Spec auto-review (`#ai-spec-review`, the `spec-review` skill) hardens a spec through adversarial rounds driven by a **single generalist reviewer** (`spec-specialist`). One generalist covers coherence, contradiction, testability, gaps, and scope -- but it carries the domain blindspots of any generalist. A spec that defines a data model gets no review from a data lens (migration safety, identity drift, consistency model *specified at all*); a spec that defines a UI gets no review from a frontend/ux lens (canonical states, a11y, flow). The code-review board already owns exactly these domain lenses (`review-db`, `review-frontend`, `review-security`, ...), but they only run against **code**, never against the **spec** where the same gaps are cheapest to fix.

The engine (`#ai-review-engine`) is explicitly built as *"one pipeline, two applications -- code review and instruction review -- sharing the registry and shape, differing only in subject, schema, persistence, and reconciliation."* Spec review is currently **outside** that engine: a bespoke single-reviewer loop. This spec brings spec review **into** the engine as **application #3**, so the domain lenses already maintained for code review become available to spec review with no forked personas, and a new role written once serves all three applications by construction.

The design must honor the recent review-board token-cost work ([review-board-token-cost-design](../../superpowers/specs/2026-06-23-review-board-token-cost-design.md)): mechanical work runs in scripts and cheap models; the strong model is reserved for the one judgment-dense step. Naively having a strong generalist ingest every specialist's prose every round would reintroduce exactly the cost that work removed.

## Goals

- **G1.** Spec review becomes a **third application of `#ai-review-engine`**, reusing the shared role registry (`instructions/roles.yaml`) and the artifact-neutral reviewer personas (`tools/claude/agents/review-<role>.md`). No spec-specific fork of any role.
- **G2.** A **curated** subset of roles participates in spec review, declared by a new `spec_review:` flag in `roles.yaml` (mirroring `instruction_review:`). Meta-lenses (`ai`, `git`) and lenses subsumed by the generalist are excluded by curation, not auto-enrolled.
- **G3.** The **generalist** (`spec-specialist`) is the **judge**: it selects which specialists to consult and **converges** their findings into the single round review and the single finding ledger. The convergence guard (`b(n)`, best, stall, cap) is unchanged -- it reads the one converged ledger exactly as today.
- **G4.** Specialists are **reconciling** reviewers: each round they read the current spec **and** the prior round's reply (rebuttal + ledger + the generalist's directed questions), so they reconcile prior findings instead of re-injecting fresh blockers that would defeat the convergence guard.
- **G5.** Token-conscious by construction, per the review-board pattern: specialists run **cheap and parallel**, write **JSON scratch** and return only a path + count (no prose ingested); the convergence-guard math runs in a **script** (`guard.mjs`); the **strong** model is reserved for the generalist's converge pass (the engine's "reduce" role, in-loop).
- **G6.** Degrades cleanly (`#ai-review-engine`): where sub-agents are unavailable, one agent role-plays the generalist + each consulted lens sequentially against the same schema and scratch; where scripts are unavailable, the author computes the guard by hand as today. Pipeline, schema, and ledger are identical across modes.

## Non-goals

- **Changing the convergence guard.** Converged/stalled/cap semantics, the per-cycle reset, and `b(n)` are untouched. Fan-out feeds the generalist *upstream* of convergence; the guard still reads one ledger.
- **A specialist panel that bypasses the generalist.** Specialists never write the round review or the ledger directly and never drive convergence. They are advisory inputs the generalist converges. (Contrast the code-review board, where reviewers write the store directly and a PM reduces once.)
- **New spec-flavored personas.** Roles stay artifact-neutral tag-compositions; spec altitude is supplied by the spawn prompt, never baked into a role.
- **Auto-enrolling every `instruction_review` role.** Membership is curated (G2).
- **Subagents spawning subagents.** The generalist does not dispatch specialists (the host forbids it); the **driver** dispatches both, executing the generalist's routing directive (see Behavior / Routing).
- **Porting code-review's path-glob gating to spec review.** A spec has no diff; specialist selection is the generalist's semantic judgment, not glob gating (see Routing).

## Background: the engine seam this reuses

`#ai-review-engine` already factors a review into:

- **Registry** (`roles.yaml`) -- each role's metadata + per-application participation flags (today: `always`, `base_lens`, `instruction_review`). A role's owned tags derive from `ownership.yaml`; its read-composition lives in `review-<role>.md`. Roles are **tag-compositions, not artifact-specific personas**.
- **Personas** (`review-<role>.md`) -- artifact-neutral. `review-db` asks *"is the data modeled and exposed soundly?"* -- a question askable of a spec or a diff. `reviewer-common.md` already says the **subject** is *"a code diff ... or an instruction set"* and is **supplied by the spawn prompt**.
- **Applications** -- differ only in **subject, schema, persistence, reconciliation** (and, this spec adds, **altitude framing**). Code review supplies a diff + `Issue` schema + the store; instruction review supplies an instruction set + `InstructionProposal`. Spec review supplies a spec + `Finding` schema + the ledger.

So spec review is a new **consumer** of the same registry and personas, not a parallel structure. **Altitude is an application property, not a role property:** the same `review-db` persona, spawned by code review, hunts implementation bugs in a migration; spawned by spec review, judges whether the spec *specifies* a sound data model at all. The persona is identical; the spawn prompt sets the altitude.

## Behavior

### Roles in a spec-review round

- **Author / Driver** -- the main orchestrating agent (unchanged identity). Revises the spec, writes the rebuttal, dispatches sub-agents, executes the generalist's routing directive, and runs `guard.mjs`. Its *mechanical* span (dispatch, collect paths, run the script) is cheap; its *judgment* span (revise the spec, write the rebuttal) is irreducible and stays on whatever model the author runs -- this is the one place spec review's main loop legitimately reasons, unlike the review-board orchestrator which is purely mechanical.
- **Generalist reviewer** (`spec-specialist`, strong, spawned fresh each round for independence) -- applies the cross-cutting lens (coherence, contradiction, testability, scope, gaps -- the `swe`/`correctness` altitude folded in) **and converges** the specialists' scratch findings into the single round review. It is the engine's **reduce**, run in-loop. It emits, as data, the **routing directive** for the next round.
- **Specialists** (`review-<role>` for each consulted curated role; cheap, parallel) -- each applies its domain lens to the spec, reconciles its prior findings, and answers the generalist's directed questions. Writes JSON scratch, returns a path + count.

The generalist subsumes `swe` (base lens: reuse, simplicity, scope discipline, future-work hygiene) and `correctness` (are requirements internally consistent and testable) at spec altitude, because those overlap the generalist's existing mandate. Specialists are the **domain** lenses only. (This split is a curation proposal -- see Curated membership -- for the dogfood spec-review to scrutinize.)

### Curated membership (`spec_review:` in `roles.yaml`)

Proposed initial set (curated, G2):

| role | `spec_review` | rationale |
|------|:---:|---|
| `swe` | false | base lens, folded into the generalist |
| `correctness` | false | coherence/testability folded into the generalist |
| `db` | **true** | does the spec specify a sound data model / migration story |
| `security` | **true** | threat surface, authz/secret handling named in the spec |
| `frontend` | **true** | canonical UI states, render/data-flow specified |
| `ux` | **true** | user flow, usability, a11y addressed at design time |
| `qa` | **true** | is each requirement testable / has an acceptance check |
| `docs` | **true** | entity/contract terms defined; docs-drift anticipated |
| `ai` | false | meta-lens (agent-behavior rules); not a feature-spec lens |
| `git` | false | meta-lens (VCS workflow); not a feature-spec lens |

`spec_review` is **independent** of `instruction_review` (a role may join one, both, or neither). Curated by hand, like `config.yaml` role activation. The generalist's consultable menu **is** `roles.yaml` filtered to `spec_review: true` -- read at spawn, never a hand-maintained second list. Adding a role with the flag set makes it routable automatically (G1 paying off at the routing layer).

### Routing (generalist is the judge; driver executes)

The host forbids a sub-agent spawning sub-agents, so the generalist cannot dispatch specialists from inside itself. Resolved by **time-shifting** the routing decision the way the existing loop already time-shifts the rebuttal -> next-round handoff.

**Uniform artifact scheme (resolves the round-1 indexing asymmetry):** round `n` **always** consumes `routing-<n>.json`. The producer differs only for round 1:

- **`routing-1.json` -- written by the driver at bootstrap.** The driver selects an initial specialist set from the spec's content against the curated registry and **writes it to `routing-1.json`** (same shape as a generalist directive; directed-questions list empty). Cheap: a lightweight classifier pass (or the author's own read) maps spec sections to candidate lenses; when in doubt it **includes** a lens (false-positive a specialist costs one cheap sub-agent; a false-negative misses a domain blocker -- bias to include at round 1). So even round 1 reads a `routing-<n>.json`; there is no special-cased "implicit bootstrap" path.
- **`routing-<n+1>.json` -- written by the generalist at the end of round `n` (`n >= 1`).** The generalist -- the judge -- decides who is consulted next round and with what directed questions.

Every `routing-<n>.json` (bootstrap or generalist) is intersected by the driver with the curated `spec_review: true` set before spawning, so an off-list lens is never spawned. This keeps "the generalist is the judge" honest while respecting the no-nested-spawn constraint: from round 2 on, routing is the generalist's call, executed one round later by the driver; round 1 is the driver's bootstrap, written to the same artifact so the pipeline has no asymmetry.

### Specialist reconciliation and the fresh-blocker guard (G4)

A specialist consulted in round n receives: the **current spec**, the **prior round's rebuttal + ledger** (its own prior findings with statuses), the **generalist's directed questions** for it, and -- on a re-consult -- the **spec diff since its last consult** (see the concrete dirtiness mechanism below). Then:

- **First consult of a lens (its round 1).** Broad in-domain pass: raise anything in its lens. Stable ids minted per finding.
- **Later consults.** **Reconcile** prior findings against the current spec text (resolved by the new text? re-raise same id if not), **answer** the generalist's directed questions, and raise **only newly-introduced** in-domain findings -- gated on the dirtiness mechanism below. It does **not** blind-re-scan the whole spec each round.

**Concrete dirtiness mechanism (resolves "material change" being undefined).** The driver keeps a per-consult snapshot of the spec for each lens under scratch (`snapshots/<role>.md`, overwritten to the current spec each time that lens is consulted). On a re-consult the driver computes the unified diff `snapshots/<role>.md` (the spec as the lens last saw it) **vs the current spec** and passes that diff in the spawn prompt. **"Materially changed domain section" is operationalized as: a diff hunk whose content falls in the lens's concern.** A re-consulted specialist may raise a **new** finding only when it can cite a diff hunk in its lens; absent any in-domain hunk, it raises no new findings and only reconciles its prior ones. This is the spec-altitude analog of the board's path-glob dirtiness scan (diff hunks here play the role diff paths play there): a concrete, checkable trigger, not a subjective threshold. After the consult the driver overwrites `snapshots/<role>.md` to the current spec.

**Guardrail against the directed-questions blindspot:** a specialist's standing mandate to raise in-domain blockers the generalist did *not* ask about is preserved (bounded by the dirtiness gate above). Directed questions add *focus*; they never cap the lens. Otherwise the generalist's blindspot would silently become the system's blindspot -- the very thing specialists exist to prevent.

This is what keeps the convergence guard safe: specialists can't inject an unbounded stream of brand-new blockers at round 4 (which would reset progress and prevent stall/converge from ever firing), because after their first consult they only raise findings tied to *changed* domain sections.

### Convergence (generalist converges; ids survive; audit trail)

The generalist reads its own cross-cutting findings **plus** every consulted specialist's scratch findings, then converges into the single `round-<n>.review.json`.

**Clean separation of authority (resolves the two-writer `wontfix` conflict): the generalist owns the TAG; the author owns the STATUS.** There is exactly one writer of each:

- **Generalist -> tag.** At converge the generalist sets each finding's tag (`blocking` / `nit`). It may **down-tag** a specialist's `blocking` finding to `nit` -- with a recorded `tagReason` and the finding's `origin` (`<role>`) preserved. Down-tagging removes the finding from `b(n)` (a nit is not counted) without touching its status. The generalist **never writes a status** -- it does not `wontfix`. So a specialist blocker leaves the open-blocking set only by (a) the generalist down-tagging it to nit (with reason), or (b) the author later resolving/wontfix-ing it. The "kill" verb from the round-1 framing is therefore a **tag** action, not a status action.
- **Author -> status.** Unchanged: at rebuttal the author writes `resolved` / `wontfix` per finding id (`finding-format.md`). The author remains the sole status writer; the generalist's down-tag does not pre-empt it.
- **Audit trail.** A specialist finding keeps its `origin` and its full tag history in the ledger (raised `blocking` by `<role>`; generalist down-tagged to `nit` with `tagReason`). Nothing is silently dropped -- a down-tagged finding stays an `open` `nit` row, visible, not vanished (G3).

`b(n)` (rows with tag `blocking` **and** status `open`) is computed from the converged ledger exactly as today. Specialist fan-out and generalist tagging are entirely upstream of the guard; the guard math is unchanged (Non-goals).

### Per-round pipeline

For round `n` (cycle-relative, per `#ai-spec-review`):

1. **Select specialists** (driver) -- read `routing-<n>.json` (round 1: the driver's own bootstrap, written before this step; round `n>=2`: the generalist's directive from round `n-1`). Re-intersect `lenses` with curated `spec_review: true`. **First-consult detection is by snapshot presence:** a lens whose `snapshots/<role>.md` does **not** exist is a first consult -- skip the diff, the spawn prompt omits the diff section (broad in-domain pass). A lens whose snapshot exists is a re-consult -- compute the diff `snapshots/<role>.md` (what that lens last saw, possibly several rounds ago if it was skipped in between -- the snapshot is per-consult, not per-round, so a skip-then-reconsult correctly diffs against the last *consult*) vs current spec, and pass it. This holds across skip gaps: a lens consulted in round 2, skipped in 3, reconsulted in 4 diffs round-2-spec vs round-4-spec.
2. **Specialist fan-out** (parallel, cheap) -- each consulted `review-<role>` reads the spec (full at first consult; current spec + the supplied diff after) + prior reply + its directed questions; writes `findings/<role>.json` (`new` + `reconcile` arrays, `Finding`-shaped, `origin` set); returns path + count. The driver then **creates or overwrites** each consulted lens's `snapshots/<role>.md` to the current spec (creating it on a first consult, overwriting on a re-consult).
3. **Generalist review + converge** (strong, fresh) -- reads the spec + prior rebuttal + ledger + all specialist scratch; writes `round-<n>.review.json` (converged findings: stable ids, generalist-set `tag`, `origin` preserved, `tagReason` on any down-tag) **and** `routing-<n+1>.json` (next-round lenses + directed questions); returns path + open-blocking count. No prose narrated back.
4. **Guard** (driver, script) -- `node guard.mjs <scratch-dir> <n> [--new-cycle]` merges the round review into `ledger.json`, computes `b(n)` and updates `meta.best`/`meta.roundsInCycle`, and emits the convergence verdict (converged / stalled / cap / continue). The driver passes `--new-cycle` only when starting a fresh cycle (a substantial post-cycle revision per `#ai-spec-review`), which resets `meta.cycle`/`roundsInCycle`/`best`. The driver reads the printed verdict, not the ledger internals.
5. **Act on the verdict.** Converged -> present final spec. Stalled / cap -> stop, summarize open blockers + contested `wontfix`, ask the user. Continue -> step 6.
6. **Author revise + rebuttal** (author, judgment) -- revise the spec to address findings; write `round-<n>.rebuttal.json` (per id: `resolved` what-changed / `wontfix` why-not); the next `guard.mjs` run folds the statuses into `ledger.json`. Go to round `n+1`.

### Scratch layout

Under `.agentsmith/tmp/spec-review/<spec-dir-name>/` (gitignored, never committed; `<spec-dir-name>` matches the spec's own directory, as today):

- `routing-<n>.json` -- the routing directive **consumed** by round `n` (round 1: driver bootstrap; round `n>=2`: emitted by the generalist at the end of round `n-1`).
- `snapshots/<role>.md` -- the spec as lens `<role>` last saw it; the driver diffs the current spec against this for the dirtiness gate, then overwrites it.
- `findings/<role>.json` -- one per consulted specialist (`new` + `reconcile`).
- `round-<n>.review.json` -- the generalist's converged review.
- `round-<n>.rebuttal.json` -- the author's per-finding statuses.
- `ledger.json` -- the running ledger `guard.mjs` reads/writes (carries a `meta` block; see shapes below).

Only the **final spec** is persisted at its normal path. Findings/ledger move from the current markdown to **JSON** for the same reason the review-board store did (one parser, every host, no dependency; `guard.mjs` reads/writes via built-in `JSON`). A human-readable `ledger.md` projection MAY be emitted by `guard.mjs` for the stall/cap summary, but the machine artifact is JSON.

### Scratch JSON shapes (resolves the underspecified-schema blockers)

Required fields only; implementations may add fields but these are the contract `guard.mjs` and the Tests depend on. A **Finding** object:

```jsonc
{ "id": "db-migration-unspecified",   // stable slug, reused verbatim on recurrence
  "origin": "db",                      // "generalist" | "<role>"  (which lens raised it)
  "tag": "blocking",                   // "blocking" | "nit"  (generalist owns this at converge)
  "tagReason": "...",                  // present only when the generalist down-tagged; else omitted
  "problem": "one line, cites a spec section",
  "fix": "concrete suggested change" }
```

- `findings/<role>.json` -- `{ "role": "db", "new": [Finding, ...], "reconcile": [{ "id": "...", "transition": "still-open"|"resolved-by-text", "note": "..." }, ...] }`. A specialist sets `origin` to its own role on every `new` finding. **A `reconcile` entry never carries a tag** (it has only `transition` -- spec-internal vocabulary, not `blocking`/`nit`): tag authority stays with the generalist. `guard.mjs` **preserves the ledger's current `tag` for a recurring id** unless the generalist's `round-<n>.review.json` re-emits that id with a different `tag` (the generalist may re-evaluate a reconciled finding's tag at converge; the specialist cannot). So a previously down-tagged (`nit`) finding surfacing as `still-open` stays `nit` until the generalist re-tags it. **`transition` is advisory, never a status mutation:** `transition: "resolved-by-text"` is the specialist *reporting* that the current spec text appears to address its prior finding -- it signals the generalist/author but `guard.mjs` does **not** auto-set `status: "resolved"`. The author's rebuttal remains the sole writer of `status` (consistent with the tag/status authority split); a specialist can never close its own finding.
- `round-<n>.review.json` -- `{ "round": n, "findings": [Finding, ...], "openBlocking": <int> }`. The converged set; the generalist's own findings carry `origin: "generalist"`, specialist findings keep their `<role>` origin. `openBlocking` is the generalist's **informational** self-count: `guard.mjs` computes `b(n)` from the merged ledger itself and **that is authoritative**; on a divergence the script logs a warning and proceeds with its own count (the field is a sanity check, never a driver of the verdict).
- `routing-<n>.json` -- `{ "forRound": n, "lenses": ["db", "frontend", ...], "questions": { "db": ["..."], "frontend": ["..."] } }`. `lenses` is the consult set (already intersected with the curated registry by the writer or re-intersected by the driver). `questions` may be empty (bootstrap `routing-1.json` has `questions: {}`).
- `round-<n>.rebuttal.json` -- `{ "round": n, "statuses": { "db-migration-unspecified": { "status": "resolved"|"wontfix", "note": "..." }, ... } }`. Author-written; the sole status source.
- `ledger.json` -- `{ "meta": { "cycle": <int>, "roundsInCycle": <int>, "best": <int|null> }, "findings": [ { ...Finding, "status": "open"|"resolved"|"wontfix", "roundRaised": <int>, "tagHistory": [{ "round": n, "tag": "...", "by": "db"|"generalist", "reason": "..." }] }, ... ] }`. `guard.mjs` owns this file. `meta.best` is the cycle's lowest `b`; `null` before the cycle's first review. `tagHistory` is the audit trail (every raise/down-tag).

`origin` is **required** on every finding from round 1 onward (no retroactive backfill problem -- this is a new artifact set). In degraded role-play mode the single agent still sets `origin` to the lens it is currently role-playing, so the field is present in every mode. `guard.mjs` rejects a finding missing `origin` or `tag` (fails closed).

## Edge cases

- **No specialist is relevant** (a pure-process spec touching no curated domain). Bootstrap selects none; the round is the generalist alone -- behaviorally identical to today's single-reviewer loop. Spec review with zero specialists **is** the current behavior, so the change is strictly additive.
- **A specialist and the generalist raise the same issue.** The generalist dedups at converge, keeping one stable id (preferring the more precise statement); the dropped duplicate is noted, not silently vanished.
- **Generalist tries to kill a specialist blocker without cause.** Disallowed: a specialist blocking finding can only leave the open set via `resolved` (spec changed) or an explicit `wontfix` + reason. `guard.mjs` treats a specialist-origin blocking id with no status as still `open` (fails safe -- it counts toward `b(n)`).
- **Specialist re-injects a fresh blocker late in the cycle.** Prevented by the dirtiness gate (later consults raise new findings only for materially-changed domain sections). If a genuinely new blocker surfaces because the author's revision *introduced* a domain regression, that is a real finding and *should* reset progress -- the guard then correctly declines to converge.
- **Routing directive names an off-list or unknown lens.** The driver intersects with the curated `spec_review: true` set; an off-list name is dropped (logged), never spawned.
- **Sub-agents unavailable** (degraded host). One agent role-plays the generalist and each consulted lens sequentially, emitting the same `findings/<role>.json` + `round-<n>.review.json` with the stance switch explicit; `guard.mjs` still runs. If scripts are also unavailable, the author computes the guard by hand (today's behavior). Same schema, same ledger, same verdict.
- **First cycle vs new cycle.** Per `#ai-spec-review`, a substantial post-cycle revision starts a new cycle (reset round count + `best`). Routing also resets: round 1 of a new cycle re-bootstraps the specialist set against the revised spec rather than carrying the stale directive.

## Implementation sketch

- **`instructions/roles.yaml`** -- add a `spec_review:` boolean to each role row, set per the Curated membership table. Update the header comment to document the new flag alongside `instruction_review`. (`ownership.yaml`/composition untouched -- a spec-review lens reads the same tags it reads for code review.)
- **`tools/claude/skills/review-board/reviewer-common.md`** -- extend three clauses for the third application, so a spec-review specialist reading this file is never routed to a code-review schema: (a) the **Subject** clause to *"a code diff (code review), an instruction set (instruction review), **or a spec (spec review)**"*; (b) the **Schema** clause to name `Finding` (pointer to `spec-review/finding-format.md`) as the third arm alongside `Issue`/`InstructionProposal`; (c) the **Output** section's schema-routing sentence to cover spec review's `findings/<role>.json` (the path token already matches; only the schema arm is new). The **altitude framing** for spec review ("judge whether your lens's concerns are *specified* -- complete, consistent, testable -- at design altitude, not implementation bugs") is supplied by the spec-review spawn prompt, consistent with how subject/schema are already spawn-supplied. No persona file changes.
- **`tools/claude/agents/review-<role>.md`** -- **no change** (artifact-neutral already). The `description:` line may optionally note "...and spec-review skills" for discoverability (inert prose, like the existing "and instruction-review" note).
- **`tools/claude/skills/spec-review/SKILL.md`** -- rewrite the loop to the per-round pipeline above: specialist selection (bootstrap / directive), parallel cheap fan-out writing scratch, the generalist converge + routing-directive emission, the `guard.mjs` step, author revise/rebuttal. State the token discipline (below) and the degradation modes. Reference `#ai-review-engine` as the parent and `#ai-spec-review` as the protocol.
- **`tools/claude/agents/spec-specialist.md`** -- extend: it now also (a) ingests consulted specialists' scratch findings and converges them (preserving `origin` + ids; it owns the **tag** and may **down-tag** a specialist blocker to nit with a `tagReason`, but it **never writes a status** -- `resolved`/`wontfix` stay the author's), and (b) emits `routing-<n+1>.json` (next-round lenses + directed questions). Its adversarial stance and findings-list output are unchanged; it gains the reduce + route responsibilities. Already has Read/Grep/Glob (sufficient to read the scratch dir).
- **`tools/claude/skills/spec-review/finding-format.md`** -- add the **JSON scratch shape** for `findings/<role>.json` (`new` + `reconcile`), `round-<n>.review.json`, `routing-<n+1>.json`, `round-<n>.rebuttal.json`, and `ledger.json`. The human-facing finding fields (id, tag, problem, fix) and the rebuttal statuses (`open`/`resolved`/`wontfix`) are unchanged; only serialization moves markdown -> JSON, and a `origin` field (`generalist` | `<role>`) is added to each finding so the audit trail records which lens raised it.
- **`tools/claude/skills/spec-review/guard.mjs`** (new, zero-dependency) -- `node guard.mjs <scratch-dir> <n> [--new-cycle]`: read `ledger.json` + `round-<n>.review.json` (+ `round-<n>.rebuttal.json` when present), merge findings by id (append new, update `tag`/`status`/`tagHistory` on recurrence, preserve `origin`), compute `b(n)` (rows `blocking` + `open`) and update `meta.best`/`meta.roundsInCycle`, evaluate the guard order (converged / stalled / cap / continue), write the updated `ledger.json`, and print the verdict + `b(n)` + `best`. **Cycle boundary is an explicit signal:** the `--new-cycle` flag (driver-supplied on a substantial post-cycle revision) resets `meta.cycle`/`roundsInCycle`/`best`; absent it, the guard advances the current cycle. No implicit detection. Deterministic, zero-dependency, JSON via built-ins, fails closed on a finding missing `origin`/`tag` -- mirroring `review-board/persist.mjs`.
- **`instructions/core/ai/ai-spec-review.md`** -- update the protocol prose: the reviewer step is now a **generalist that converges a curated specialist fan-out**; specialists are reconciling lenses from the shared registry; the convergence guard is unchanged and reads the single converged ledger; specialist blockers carry their own ids and can only be retired by `resolved`/`wontfix`. State that spec review is an application of `#ai-review-engine`.
- **`instructions/core/ai/ai-review-engine.md`** -- update the "one pipeline, **two applications**" line to **three** (code review, instruction review, spec review), noting spec review's distinguishing trait: the reduce runs **in-loop** (the generalist converges each round) rather than once-per-round, and selection is the generalist's semantic routing rather than path-glob gating.

## Tests

- **`roles.yaml` shape** -- a test asserts every role row carries `spec_review` (boolean) and that the curated set matches the table (db/security/frontend/ux/qa/docs true; swe/correctness/ai/git false). Guards against a new role silently defaulting in/out.
- **`guard.mjs`** (new test file) -- deterministic unit tests over fixtures:
  - `b(n)` counts only `blocking` + `open`; specialist-origin blocker with no status counts as `open` (fail-safe).
  - converged (`b(n)=0`), stalled (two consecutive non-progress reviews in a cycle), cap (5 rounds/cycle), continue -- the guard order and first-match-wins.
  - per-cycle `best`/round-count reset is driven by `--new-cycle` and **only** by it (absent the flag, the cycle advances; no implicit reset).
  - merge: new id appended; recurring id updates `tag`/`status`/`tagHistory`; `origin` preserved; rebuttal statuses folded in.
  - **tag authority:** a generalist down-tag (`blocking`->`nit` + `tagReason`) removes the finding from `b(n)` but leaves `status` untouched (still `open`) and appends a `tagHistory` entry; a finding missing `origin` or `tag` -> non-zero exit (fails closed), like `persist.mjs`.
  - **reconcile tag preservation:** a specialist `reconcile` entry with `transition: "still-open"` leaves the ledger `tag` unchanged (incl. a prior down-tagged `nit`); the same id re-emitted in `round-<n>.review.json` with a different `tag` updates it and appends `tagHistory`.
  - **openBlocking divergence:** a `round-<n>.review.json` whose `openBlocking` disagrees with the merged-ledger `b(n)` -> guard logs a warning, uses its own count, exits 0 (informational field, not a failure).
  - malformed scratch JSON -> non-zero exit (fails closed).
- **Routing directive** -- fixtures assert: an off-list lens name in `routing-<n>.json` is dropped at the driver intersection (never spawned); an empty `lenses` produces a generalist-only round (identical ledger shape to today's single-reviewer round); the round-1 bootstrap `routing-1.json` and a round-`n` generalist directive produce the same downstream ledger shape (no bootstrap special-casing leaks).
- **Dirtiness / snapshot lifecycle** -- a first-consult lens (no `snapshots/<role>.md`) is spawned with no diff and its snapshot is created afterward; a re-consult diffs against the prior snapshot; a consult-skip-reconsult sequence (round 2, skip 3, round 4) diffs the round-2 snapshot against the round-4 spec (the snapshot is per-consult, not per-round).
- **Engine reuse (no fork)** -- a structural test asserts no `review-<role>.md` persona contains spec-specific text (artifact-neutrality preserved); spec altitude lives only in the spawn prompt / `reviewer-common.md`. A companion assertion checks `reviewer-common.md`'s Subject/Schema/Output clauses carry the **third (spec-review) arm** (`Finding` / `findings/<role>.json`), so the shared protocol is not left at two arms while the personas are expected to serve three.
- **Audit trail** -- a fixture round where a specialist raises a blocker and the generalist **down-tags** it: assert the finding has `tag: "nit"` and a non-empty `tagReason`, that `status` remains `open`, that a `tagHistory` entry records the change, and that the id is present in `ledger.json` (not vanished). (No `wontfix` here -- a down-tag is a tag action, not a status action; `wontfix` is author-only.)
- **Degradation** -- a role-play-mode fixture produces the same `ledger.json`/verdict as the sub-agent mode for an identical findings set (pipeline/schema/ledger identical across modes).

## Verification

Two distinct runs, not to be conflated:

- **Spec-content hardening (now, current tool).** Running `/spec-review` on *this* spec exercises the **old single-reviewer loop** (the new pipeline does not exist yet), so it verifies *this spec's own content*, not the new mechanism. This is the dogfood that gates the spec -> plan transition; it is **not** acceptance of the feature.
- **Feature acceptance (post-implementation, new mechanism).** After the build, a spec-review run uses the new pipeline: it consults the relevant curated specialists, the generalist converges + routes, `guard.mjs` drives the loop, and the spec converges or escalates per the unchanged guard. Acceptance criteria:
  - `npm test` green (new `guard.mjs` tests + `roles.yaml` shape test + routing/tag-authority tests).
  - A spec with an obvious data-model gap (e.g. an unspecified migration story) gets a `db`-origin **blocking** finding that a generalist-only run misses -- the feature's reason to exist, demonstrated once.
  - A specialist blocker the generalist down-tags to nit leaves `b(n)` yet stays an `open` row with `origin` + `tagHistory` intact (audit trail holds).

## Docs drift

- **`README`** -- note spec review is now an application of the role-based review engine (curated specialist fan-out), alongside code review and instruction review.
- **`#ai-review-engine` / `#ai-spec-review`** -- updated as in the Implementation sketch (the instruction source is the canonical doc; `AGENTS.md` regenerates).
- **`docs/future-work/`** -- if the round-1 bootstrap classifier proves weak, log "learned routing" (the generalist proposes the round-1 set from a dry pass) as deferred.

## Token discipline

Mirrors [review-board-token-cost-design](../../superpowers/specs/2026-06-23-review-board-token-cost-design.md):

- **Specialists are cheap and parallel**, write JSON scratch, and return only a path + count -- their prose never enters any context. The generalist reads the *structured* findings (compact), not narrated deliberation.
- **The guard math is a script** (`guard.mjs`), not model work -- the deterministic, error-prone state-tracking (best, stall tally, cap, per-cycle reset) leaves the model entirely; the driver reads a one-line verdict.
- **The strong model is reserved for the generalist converge pass** -- the engine's reduce, the one judgment-dense step, run in-loop. Everything around it (specialist fan-out, guard, routing execution) is cheap or scripted.
- **No summary-projection step (deliberate divergence from the board, disclaimed).** The review-board PM reads a `persist.mjs summary` projection because reviewers there emit large prose+YAML. Here specialist findings are already compact structured JSON (`id`/`origin`/`tag`/`problem`/`fix`), bounded by *finding count* over a curated <=6-lens set, not by prose -- so the generalist ingests them directly with no projection. This is an accepted, bounded divergence from the cited pattern, not an oversight; if a curated set ever grows large enough to matter, a `guard.mjs summary` projection is the additive fix.
- **Reconciliation, not re-scan** -- after a lens's first consult it reads only changed domain sections + its prior findings, never the whole spec again. Bounded ingestion per round.
- Net: the only irreducible strong-model spans are the generalist converge and the author's spec revision -- both genuine judgment. The mechanical span (selection, fan-out collection, guard) is cheap/scripted, exactly as the review-board work established.
