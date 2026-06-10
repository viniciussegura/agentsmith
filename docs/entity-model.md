# Entity model

The core concepts of agentsmith's tooling, expressed as pure TypeScript types.
This is how a reader should *understand* the model -- not a description of how it is stored (the on-disk YAML layout lives in `tools/claude/skills/review-board/issue-format.md`).
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

`InstructionProposal` is a core entity of the instruction-review application: a proposed new, strengthened, rehomed, or re-owned instruction rule, raised by a role through its lens and rolled into the backlog `docs/future-work/proposed-instruction-rules.md`.
Its full type is documented here when the instruction-review application lands (Phase 3 of the review-board plan).
