---
name: review-board
description: Run a role-based code-review round over the current repo state or a branch-vs-default-branch diff. Use when the user runs /review-board, or asks to review a branch/PR/diff with the review board, or to reconcile or sweep the issue store. Fans out role reviewers, verifies findings adversarially, reconciles prior issues, and a PM reduce writes a prioritized triage report.
---

# Code-review board

Run one review round of the code-review application of agentsmith's review engine (`#ai-review-engine`, `#ai-review-board`).
A round is a single pass -- **setup -> reconcile+review -> verify -> persist(summary) -> reduce -> persist(apply) -> present** -- not an inner convergence loop.
Schema, status lifecycle, ids, and the store layout are in `issue-format.md`; read it before persisting.

## When to run

- The user invokes `/review-board [--full-sweep] [<branch>]`, or asks to review a branch/PR/diff, or to sweep/reconcile the store.

## Roles

Reviewers fan out in parallel on a **cheap model**, one sub-agent per selected role (`review-correctness`, `review-swe`, `review-security`, `review-db`, `review-qa`, `review-docs`, `review-frontend`, `review-ux`).
The verifier (`review-verifier`) is a per-finding skeptic, also cheap and parallel; the PM reduce (`review-pm`) runs on a **strong model**.
Each reviewer is application-neutral: the spawn prompt has it read the shared protocol (`reviewer-common.md`) then its persona (`review-<role>.md`), supplies the **subject** (the diff + touched files, by reference), and names the **output schema** (`Issue`, per `issue-format.md`).
Where sub-agents are unavailable, role-play each lens sequentially, emitting the same artifacts (`#ai-review-engine` degradation).

## Store and scratch

- Local canonical store **and** its `config.yaml` under `.agentsmith/review-board/` (gitignored, per-machine; layout in `issue-format.md`), mutated in place across rounds; nothing committed to the repo. The durable shared record is the external tracker (promoted issues), not this store.
- Ephemeral per-run scratch under `.agentsmith/tmp/review-board/<round-id>/` (gitignored): each reviewer's raw output, every verifier transcript (including rejected findings), and the PM deliberation. Never committed; retained until the round's `triage.md` has been reviewed and any promotion done.

## Round pipeline

### 1. Setup (main thread)

- **Mode**: `diff` (branch vs default branch) or `full-sweep` (re-examine the whole project). Default `diff`. `--full-sweep` forces full-sweep.
- **Target** (`targetRef`): `feature-branch` (reviewing a branch before merge -- the usual case) or `main` (a periodic review of what landed on the default branch).
- **`commit` + `baselineCommit`** (baseline is **always a live default-branch SHA**), by target:
  - `feature-branch`: `commit` = branch tip; `baselineCommit = merge-base(commit, <default>)`, recomputed from git each round (squash-safe -- never chained off a branch tip).
  - `main`: `commit` = current default-branch HEAD. `baselineCommit` = the `commit` of the most recent prior `main` round in the local store (the recurring case: "current HEAD vs the last `main` round"). If **no prior `main` round** exists, **bootstrap**: `full-sweep`, `baselineCommit` = current default HEAD. If the **local store is absent** (fresh clone / wiped machine) the prior-round SHA is unknowable -- do not infer; offer bootstrap / full-sweep / a user-provided hash and ask at the confirmation gate.
- `<default>` is the repo's configured default branch, resolved once. If a branch shares no history with it (`merge-base` empty), fall back to `full-sweep` with `baselineCommit` = current default HEAD.
- **Mode precedence**: force `full-sweep` whenever no usable baseline diff exists (first repo round; first `main` round with no prior). The first round in a repo is always a `full-sweep` with no carry-forward.
- Compute the diff over `baselineCommit..commit` (`diff` mode) or take the whole-project surface (`full-sweep`).
- **Select roles** from `.agentsmith/review-board/config.yaml`: a role runs when the diff touches a path matching its globs, or a commit message in `baselineCommit..commit` matches its keywords. `correctness` and `swe` always run. A `full-sweep` runs every active role. The user may force-add a role.
- **Dirtiness scan** (the step-2 test) over all prior open **and recently-closed** issues; **force-select the owning role** (the issue id's `<role>` segment) of any dirty issue even if gating would skip it.
- If `.agentsmith/review-board/config.yaml` is absent, create it from the **default config** (below) before selecting.
- **Confirmation gate**: present the resolved `mode`, `targetRef`, and the selected role set, and **confirm the `baselineCommit`**, offering (with a recommended default marked): **(i-feature)** `merge-base` for a feature branch; **(i-main)** the prior `main`-round SHA; **(i-bootstrap)** default HEAD for a first-ever `main` round; **(ii)** a fresh full sweep (zero carry-forward); **(iii)** a user-provided hash. On an **absent local store** for a `main` round, present (i-bootstrap)/(ii)/(iii) and ask -- do not auto-pick. Confirm or override **in one interaction**. An explicit non-interactive run may skip the gate and use the computed default.

### 2. Reconcile + review (parallel, one sub-agent per selected role, cheap model)

- A prior issue is **dirty** when `git diff <issue.lastConfirmedCommit>..<commit>` (with rename detection) touches any path in its `locations` -- diff to `commit` (the code under review) so branch-only changes are caught.
- The dirty scan covers **open** issues and **recently-closed** ones (`closedInRound` within the window, default last 3 rounds), so a regression **reopens** the original id. Closing does **not** advance `lastConfirmedCommit`.
- For each dirty issue the role re-checks validity against the current code (real re-read, not file-membership) and transitions it: open -> `fixed`/`deprecated`/`superseded` or still `open`; recently-closed -> `open` on regression (a reopen, same id). On confirming still-open it updates `locations` to current text and sets `lastConfirmedCommit = baselineCommit`.
- In the same pass the role raises **new** findings, numbering them per the compositional id.
- A non-dirty open issue carries forward unchanged, no re-read. A `full-sweep` re-checks every prior open issue and advances `lastConfirmedCommit = baselineCommit` for each re-confirmed.
- Each reviewer **writes its findings to `.agentsmith/tmp/review-board/<round-id>/findings/<role>.json`** (`new` + `reconcile` arrays, per `issue-format.md`) and returns only that path plus a one-line count -- it does not return findings inline (`reviewer-common.md` output contract).

### 3. Verify (adversarial, parallel, per new finding, cheap model)

- One-time-at-entry: verify runs only on findings new this round; spawn one `review-verifier` per finding, biased to reject.
- Drop rejected findings before persistence (they live only in scratch).
- Carried-forward issues are not re-verified -- retiring a stale carried issue is reconcile's job (step 2).
- Each verifier **writes its verdict to `verdicts/<finding-id>.json`** (`{ id, verdict, rationale }`) and returns only the path + verdict; rejected ids are dropped by `persist.mjs`, their rationale retained in scratch.

### 4. Persist (main thread)

- The driver writes the round's `ReviewRoundInfo` to `.agentsmith/tmp/review-board/<round-id>/round.json` (Setup already computed every field).
- **Build the PM input:** run `node .claude/skills/review-board/persist.mjs summary .agentsmith/review-board <round-id>`; it writes `pm-input.json` (carried-forward open issues + accepted new findings, as lean summaries) for the reduce.
- Persistence proper happens **after** the reduce (step 5b), in one deterministic `persist.mjs apply` call -- the driver no longer hand-authors issue/epic/round files.

### 5. Reduce (PM role, strong model)

- Spawn `review-pm` with `pm-input.json`; it consolidates priority, groups issues into canonical epics, marks duplicates, may down-rank/reject (with a recorded reason), and writes **both** `.agentsmith/review-board/rounds/<round-id>.triage.md` (the human report) and `.agentsmith/tmp/review-board/<round-id>/pm-directive.json` (the structured directive `persist.mjs` applies).

### 5b. Persist apply (main thread)

- Run `node .claude/skills/review-board/persist.mjs apply .agentsmith/review-board <round-id>`. It reads the findings + verdicts + `pm-directive.json`, drops rejected findings, writes verified-new issues under their minted ids, applies reconcile and PM transitions, moves closing issues to `closed/`, writes `rounds/<round-id>.json`, updates epics, and runs `lint.mjs` as its final step.
- A non-zero exit means the scratch was malformed or the write left the store invalid. Read the reported errors, fix the offending scratch/directive, and rerun -- `persist.mjs` is deterministic, so a clean rerun reproduces a clean store.

### 6. Present (main thread)

- Summarize the round, **including the count of findings verify rejected** and the path to their scratch transcripts, so a human can spot-check the bias-to-reject drops.
- Offer to promote selected issues/epics via `/review-promote` (the human validation step).

## Default config (`.agentsmith/review-board/config.yaml`)

When absent, create it with this default. It is hand-maintained thereafter (activate a role by adding a row). `correctness` and `swe` are always-on (no gating).

```yaml
# Active roles and their path/keyword gating. correctness + swe always run.
roles:
  correctness: { always: true }
  swe:         { always: true }
  security:    { paths: ["**/auth/**", "**/*secret*", "**/*.env*", ".env.example"], keywords: ["auth", "secret", "token", "sql", "crypto", "password"] }
  qa:          { paths: ["test/**", "tests/**", "**/*.test.*", "**/*.spec.*"], keywords: ["test", "coverage"] }
  docs:        { paths: ["**/*.md", "docs/**", "README*"], keywords: ["docs", "readme"] }
  db:          { paths: ["**/migrations/**", "**/schema*", "**/entities/**", "**/models/**"], keywords: ["schema", "migration", "entity", "api"] }
  frontend:    { paths: ["**/*.tsx", "**/*.jsx", "**/*.vue", "**/*.css", "**/*.scss", "**/components/**"], keywords: ["component", "css", "render"] }
  ux:          { paths: ["**/*.tsx", "**/*.jsx", "**/*.vue", "**/pages/**", "**/views/**"], keywords: ["flow", "usability", "ux"] }
# Phase 3 (instruction review) adds:
# instruction-review:
#   participants: [swe, security, db, qa, docs, frontend, ux, ai, git]
```

## Degradation

Per `#ai-review-engine`: real sub-agents when available; else one agent role-plays each lens sequentially with the same schema and store; else a human supplies findings the agent maps onto the schema. The pipeline, schema, and store are identical across modes.

## Token discipline

Parallel fan-out; cheap model for review/verify, strong only for the PM reduce; each reviewer gets only the diff + its touched files + its profile tags (never the whole repo); the diff is computed once and passed by reference; non-dirty issues carry forward without re-read; the PM groups on summaries and pulls full descriptions only for issues it merges.

The orchestration span is now mechanical -- dispatch agents, collect scratch paths, run `persist.mjs` -- because reviewers/verifiers write JSON scratch the driver never ingests and persistence is a deterministic script. So run the **driver on a cheap model** where the host lets the operator pick the session model; the strong model stays reserved for the `review-pm` reduce (its own dispatch). This is guidance, not an enforced mechanism: a skill cannot set its own session model.
