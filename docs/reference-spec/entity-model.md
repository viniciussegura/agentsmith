# Entity model

The core concepts of agentsmith's tooling, expressed as pure TypeScript types.
The canonical member of the reference spec (`#swe-reference-spec`): it reflects the model as it is **now** and carries no `Status:` line.
This is how a reader should *understand* the model -- not a description of how it is stored (the on-disk YAML layout lives in `tools/claude/skills/code-review-board/issue-format.md`).
Per `#swe-entity`, every change to the entity schema updates this file; per `#swe-terminology`, these names are used identically everywhere.

The portable instructions, the role registry, and the tag-ownership map are tooling **config** (like `manifest.json`), not core entities, and are documented as config rather than here.

## Code-review board

The entities the code-review board (`#ai-review-board`) raises, tracks, and reconciles.

```typescript
type Priority = 'low' | 'medium' | 'high';
// high   = data loss, security exposure, or breaks users / the build
// medium = degrades quality, maintainability, or correctness without breaking users
// low    = cosmetic or nice-to-have
// Priority is a within-lens judgment; the PM consolidates across lenses using priorityRationale.

type IssueStatus =
  | 'open'        // live, unaddressed
  | 'promoted'    // human-validated and escalated to the external tracker; NOT a closing status
  | 'fixed'       // the code now addresses it
  | 'deprecated'  // the concern itself went away
  | 'superseded'  // replaced by a newer, broader issue
  | 'duplicated'; // a duplicate of another open issue

type IssueKind = 'issue' | 'epic';

// A precise place in the code. The snippet is a relocation hint, never an identity key
// (both line numbers and content drift as the code changes).
interface FileLocation {
  filename: string;          // repo-relative path
  lines: [number, number];   // inclusive; a single line means lines[0] === lines[1]
  snippet: string;           // elided line content
}

// A typed link between two issues (child-of, duplicate-of, superseded-by, ...).
interface RelatedIssue {
  issueId: string;           // the related issue's globally-unique id
  description: string;       // why they relate
}

// One finding raised by a reviewer role through its lens. Identity is the compositional
// id "<roundId>#<role>-<n>", globally unique by construction and never reused.
interface Issue {
  id: string;
  kind: 'issue';
  title: string;
  description: string;       // markdown
  priority: Priority;
  priorityRationale: string; // one line: why this level, in the reviewer's lens
  status: IssueStatus;
  lastConfirmedCommit: string; // the default-branch SHA at which this issue was last verified
  locations?: FileLocation[];
  relatedIssues?: RelatedIssue[];
  closedInRound?: string;    // round id in which status became a closing one
  promotedTo?: string;       // external tracker URL/ref; set together with status 'promoted'
  closingComments?: string;  // fixing commit/PR, what superseded/duplicated it, why deprecated
}

// A canonical grouping of related issues, mutated in place across rounds by the PM.
// An epic stays 'open' while any child is 'open', then rolls up by its children's
// terminal states (all closing -> 'fixed'; any 'promoted' and none open -> 'promoted').
interface Epic {
  id: string;                // "<roundId>#epic-<n>"
  kind: 'epic';
  title: string;
  description: string;
  priority: Priority;
  priorityRationale: string;
  status: IssueStatus;
  relatedIssues: RelatedIssue[]; // the child issues
  closedInRound?: string;
  promotedTo?: string;
  closingComments?: string;
}

// The durable record of one review round -- the anchor of the squash-safe baseline chain.
interface ReviewRoundInfo {
  id: string;                            // round id == its store directory name
  mode: 'diff' | 'full-sweep';
  targetRef: 'main' | 'feature-branch';  // selects baseline derivation
  commit: string;                        // the reviewed commit
  baselineCommit: string;                // ALWAYS a live default-branch SHA, never undefined
  previousRound?: string;                // prior round id (any target)
  roles: string[];                       // reviewer role ids triggered this round
}
```

## Instruction review

The entity the instruction-review application (`#ai-instruction-review`) raises: a proposed change to the instruction set, triaged via an editable worksheet and applied through a separate human-gated step.

```typescript
type ProposalKind =
  | 'new-rule'    // a rule the domain expects but the set lacks
  | 'strengthen'  // an existing rule that is too weak or ambiguous
  | 'rehome'      // an existing rule that should move to a different instructions/ file
  | 'reowner';    // an existing rule whose ownership row should change owner

// One proposed change to the instruction set, raised by a role through its lens.
// Fields are required per kind (see below).
interface InstructionProposal {
  kind: ProposalKind;
  tag: string;        // new #tag (new-rule) or an existing #tag (strengthen/rehome/reowner)
  role: string;       // the role (lens) that raised it -- ties the proposal to the shared registry
  gap: string;        // the gap or problem it addresses
  rationale: string;  // one line
  status: 'ready' | 'blocked' | 'conditional';
  blockedOn?: string;     // a #tag or condition, when blocked/conditional
  targetFile?: string;    // required for new-rule/strengthen: the instructions/ file the rule belongs in
  draft?: string;         // required for new-rule once concrete: a drop-in house-style rule block
  proposedFile?: string;  // required for rehome: where the rule should move
  proposedOwner?: string; // required for reowner: the role / base lens / non-review marker it should be owned by
}
```

Required-per-kind: `new-rule` and `strengthen` require `targetFile` (`new-rule` also `draft` once concrete); `rehome` requires `proposedFile`; `reowner` requires `proposedOwner`, which must resolve to a declared role, the `swe` base lens, or a known non-review marker.

Persistence: the open queue, drafts, scorecard, and candidates are ephemeral in `.agentsmith/instruction-review/triage.json` (gitignored, per-machine); the single committed output is the decisions log `docs/instruction-rules-decisions.md`. Applying decisions to `instructions/` sources is the separate, human-gated `/instruction-apply` step -- a round alone never edits instruction sources.

Each round archives the prior worksheet's scorecard to a sibling `.agentsmith/instruction-review/triage.prev.json` (also gitignored) before overwriting `scorecard`; the triage UI reads this archive to render per-cell trend arrows (this round's verdict vs the previous round's). The "ignore parked" setup gate archives the whole worksheet to the same path. No archive (first round, or wiped store) means no arrows.

### Worksheet entities (`triage.json`)

The worksheet carries three siblings -- the `scorecard`, the `candidates` (undrafted proposals awaiting triage), and the `entries` (drafted proposals) -- validated by `devtools/triage-ui/schema.mjs`.

```typescript
type Verdict  = 'strong' | 'good' | 'weak' | 'gaps';
type Priority = 'high' | 'medium' | 'low';

interface Scorecard {
  lenses: string[];        // matrix columns (participating role ids)
  perLens: PerLensRow[];   // one row per per-lens dimension (coverage, clarity, ...)
  global: GlobalRow[];     // one row per global/structural dimension (cohesiveness, ...)
  details: Finding[];      // the per-rule findings; cells/global roll up from these
  nits: (string | { text: string; fix?: 'auto' })[]; // mechanical nits; fix:'auto' = agent fixes on apply
}
interface PerLensRow { dimension: string; cells: Cell[]; }    // cells positionally aligned to lenses
interface Cell       { lens: string; verdict: Verdict; }      // = worst of its matching findings, else strong
interface GlobalRow  { dimension: string; verdict: Verdict; } // = worst of its lens-absent findings, else strong
interface Finding    { dimension: string; lens?: string; file: string; tag: string; verdict: Verdict; note: string; }
                     // lens absent => a global finding; a cell/global verdict is DERIVED as the worst of its findings

interface Candidate {  // a verified-but-undrafted proposal awaiting triage (no draft)
  tag: string; kind: ProposalKind; role: string; targetFile: string; gap: string;
  priority: Priority;
  decision: { verdict: 'park' | 'wanted' | 'reject'; details?: string };
}
```

`scorecard` is a per-round artifact (each reduce overwrites it; `null` when the setup gate's stop-and-process path runs). A cell or global verdict is never asserted on its own -- it is the worst-score roll-up of its `details` findings (`strong` when none), and the validator enforces that equality. An `Entry` is the drafted form a `wanted` candidate is promoted into (it adds `draft`, `status`, `decision` with the full `Verdict` set, and an `applyLog`); see the worksheet schema for its per-kind fields.
