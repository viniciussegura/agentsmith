# Issue format and the issue store

Reference for the code-review board (`#ai-review-board`): the schema, the status lifecycle, the compositional id, and the on-disk store.
The reviewer/verifier/PM agents are application-neutral; this file is the code-review schema their spawn prompts point to.

## Schema

```typescript
type Priority = 'low' | 'medium' | 'high';
// high   = data loss, security exposure, or breaks users / the build
// medium = degrades quality, maintainability, or correctness without breaking users
// low    = cosmetic or nice-to-have
// Priority is a within-lens judgment; the PM consolidates across lenses using priorityRationale.

type IssueStatus = 'open' | 'promoted' | 'fixed' | 'deprecated' | 'superseded' | 'duplicated';
// 'promoted' is NOT a closing status: validated and escalated to an external tracker, so it is neither
// re-raised (not open) nor reopen-eligible (not closed).
type IssueKind = 'issue' | 'epic';

interface FileLocation {
  filename: string;          // repo-relative path
  lines: [number, number];   // inclusive; a single line means lines[0] === lines[1]
  snippet: string;           // elided line content; a relocation hint, NOT a key (lines and content drift)
}

interface RelatedIssue {
  issueId: string;           // the related issue's globally-unique id (its <roundId> prefix encodes the origin round)
  description: string;       // why they relate (child-of, duplicate-of, superseded-by, ...)
}

interface Issue {
  id: string;                // "<roundId>#<role>-<n>"; epics "<roundId>#epic-<n>". Minted locally by the raising round.
  kind: IssueKind;
  title: string;
  description: string;       // markdown
  priority: Priority;
  priorityRationale: string; // one line: why this level, in the reviewer's lens
  status: IssueStatus;
  lastConfirmedCommit: string; // the main SHA (a baselineCommit) at which this issue was last verified
  locations?: FileLocation[];
  relatedIssues?: RelatedIssue[]; // for an epic, these are its child issues
  closedInRound?: string;    // round id in which status became a closing one
  promotedTo?: string;       // external tracker URL/ref; set with status 'promoted' by /review-promote
  closingComments?: string;  // fixing commit/PR, what superseded/duplicated it, why deprecated
}

interface ReviewRoundInfo {
  id: string;                // round id == its directory name (see Store)
  mode: 'diff' | 'full-sweep';
  targetRef: 'main' | 'feature-branch'; // selects baseline derivation
  commit: string;            // the reviewed commit; branch tip (feature-branch) or main HEAD (main round)
  baselineCommit: string;    // ALWAYS a live default-branch SHA, never undefined
  previousRound?: string;    // prior round id (any target)
  roles: string[];           // reviewer role ids triggered this round
}
```

## Status lifecycle

| status | meaning | set by |
|--------|---------|--------|
| `open` | live, unaddressed | reviewer (on raise); reconcile (confirm still-open, or **reopen** of a recently-closed regression) |
| `promoted` | human-validated and escalated to the tracker (`promotedTo` set); **not** closing | `/review-promote` (human) |
| `fixed` | the code now addresses it | reconcile |
| `deprecated` | the concern itself went away | reconcile |
| `superseded` | replaced by a newer, broader issue (link via `relatedIssues`) | reconcile or PM |
| `duplicated` | a duplicate of another open issue (link the survivor) | PM (consolidation) |

A **closing** status (`fixed`/`deprecated`/`superseded`/`duplicated`) sets `closingComments`, stamps `closedInRound`, and moves the file to `closed/`; only closing statuses inside the recently-closed window are reopen-eligible.
`promoted` moves the file to `promoted/` and is excluded from **both** the re-raise scan (not open) and the reopen set (not closed); a promoted issue is **frozen** -- its `lastConfirmedCommit`/`locations` are not advanced even if its file later changes.

## Compositional id

`<roundId>#<role>-<n>`: `<roundId>` is the raising round (globally unique -- round ids never repeat), `<role>` the owning role, `<n>` that role's local counter over **newly-raised** findings this round (carried-forward/reopened issues keep their origin-round id and do not consume the counter).
Epics are `<roundId>#epic-<n>`, minted by the PM.
Ids are never reused, so `relatedIssues` links stay valid forever; the `<role>` segment is what Setup reads to force-select a dirty issue's owning role.
Filenames render the id filesystem-safely (the `#` may be written as `--`); the trailing `<slug>` is regenerable decoration, identity keys off the id.

## The store

Committed, canonical, living (not per-round folders):

```
reviews/
  config.yaml                            active roles + gating table (+ instruction-review.participants, Phase 3)
  issues/<role-id>/<id>-<slug>.yaml       open issues, mutated in place across rounds
  issues/<role-id>/closed/<...>.yaml      issues with a CLOSING status
  issues/<role-id>/promoted/<...>.yaml    issues escalated to the external tracker (status 'promoted')
  epics/<epic-id>.yaml                    canonical epics, mutated in place
  epics/closed/, epics/promoted/          rolled-up epics
  rounds/<round-id>.yaml                  one ReviewRoundInfo per round
  rounds/<round-id>.triage.md             the PM triage report (per-round, kept for history)
```

`<round-id>` follows `<YYYY-MM-DD>[<letter>]-<target-branch>` (e.g. `2026-06-09b-feature-x`); it is the `<roundId>` prefix in every id minted that round.
Per-run reasoning (reviewer outputs, verifier transcripts including rejected findings, PM deliberation) is **ephemeral** under `.agentsmith/tmp/review-board/<round-id>/`, gitignored, never committed; retained until the round's `triage.md` is reviewed.
No agent deletes store files -- git history is the archive.
