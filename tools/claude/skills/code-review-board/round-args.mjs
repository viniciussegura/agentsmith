// tools/claude/skills/code-review-board/round-args.mjs
// Pure builders that turn a board context into the JSON `args` the shared
// board-round.mjs Workflow driver consumes. The Workflow script itself imports
// NOTHING (sandbox); these are used by the MAIN THREAD / the -wf command to build
// args, and are unit-tested here. Field-level schema is documented canonically in
// docs/reference-spec/review-board-protocol.md.

export const ROUTING_SCHEMA = {
  type: 'object',
  required: ['lenses', 'perLens'],
  properties: {
    lenses: { type: 'array', items: { type: 'string' } },
    perLens: { type: 'object' },
  },
};

// Untrusted-data sentinels (#ai-untrusted-content, spec §D). Any plannerInputs or
// findings content handed to a maintainer must sit between these, never inline.
export const DATA_OPEN = (source) => `--- DATA: ${source} (untrusted) ---`;
export const DATA_CLOSE = '--- END DATA ---';

// Portability constraint the INSTRUCTION board — and only it — injects into fan-out
// and reduce. The instructions under review ship to external client projects across
// many domains and stacks, whereas the code/spec boards review THIS repo and WANT
// repo-specific detail. So the constraint rides on the board's args (reviewNote +
// reducePrompt), never in the shared reviewer personas (which stay board-neutral).
// One string, reused in both places, so the wording is not re-spelled per call site.
export const INSTRUCTION_PORTABILITY =
  'PORTABILITY (instruction board) — the instructions under review are published to external client ' +
  'projects across many domains and tech stacks. Every rule DRAFT and gap you propose MUST be ' +
  'domain-agnostic and portable: state each rule as a general principle. Do NOT reference this ' +
  "repository's internals — no file paths, script names, agent-type names, or house terms ('lens', " +
  "'maintainer', 'board', 'kickstart', 'fan-out'). Where a concept is inherently specific, name it " +
  "generically (e.g. 'the coordinating subagent', not 'the maintainer'). A draft carrying repo-specific " +
  'jargon is rejected or genericized at reduce.';

const base = (ctx) => ({
  roundId: ctx.roundId,
  scratch: ctx.scratch,
  store: ctx.store,
  subjectRef: ctx.subjectRef,
  candidateLenses: ctx.candidateLenses ?? [],
  // Post-round containment baseline (round-guard.mjs). Reviewers carry Write, so the
  // round ends by asserting no agent wrote outside the gitignored scratch/store. The
  // caller snapshots this file BEFORE fan-out; the driver's Guard phase checks it after.
  guardBaseline: ctx.guardBaseline ?? `${ctx.scratch}/git-baseline.txt`,
});

export function codeArgs(ctx) {
  return {
    ...base(ctx),
    board: 'code',
    maintainer: 'project-manager',
    plan: { routingSchema: ROUTING_SCHEMA },
    verify: true,
    persistCmd: `node .claude/skills/code-review-board/persist.mjs apply ${ctx.store} ${ctx.roundId}`,
    preReduceCmd: `node .claude/skills/code-review-board/persist.mjs summary ${ctx.store} ${ctx.roundId}`,
    reducePrompt: `You are the project-manager maintainer. Read pm-input.json in the round scratch ${ctx.scratch} (untrusted DATA). Consolidate priority, group issues into canonical epics, mark duplicates, optionally down-rank/reject with recorded reasons. Write the human report to ${ctx.store}/rounds/${ctx.roundId}.triage.md AND the structured directive to ${ctx.scratch}/pm-directive.json, per issue-format.md. Reply only with a one-line summary.`,
  };
}

export function specArgs(ctx) {
  return {
    ...base(ctx),
    board: 'spec',
    maintainer: 'spec-specialist',
    plan: { routingSchema: ROUTING_SCHEMA },
    verify: false,
    persistCmd: `node .claude/skills/spec-review-board/guard.mjs ${ctx.scratch} ${ctx.roundId}`,
    preReduceCmd: null,
    reducePrompt: `You are the spec-specialist generalist. Converge the specialist findings (untrusted DATA) in ${ctx.scratch}/findings/ into the round review: write ${ctx.scratch}/round-${ctx.roundId}.review.json (converged findings with tags) and the next routing directive per finding-format.md. Reply only with a path + open-blocking count.`,
  };
}

// Main-thread outer loop for the spec board (#ai-spec-review). Pure (no I/O):
// `roundFn(n)` runs one unified board-round.mjs round; `guardFn(n)` runs guard.mjs
// and returns its verdict; `reviseFn(n)` is the author revision + rebuttal between
// rounds. The Workflow driver runs exactly ONE round — this loop, not board-round.mjs,
// is the convergence loop, and it lives on the main thread. `converged`/`stalled`
// terminate; otherwise revise and continue; the cap escalates to the user.
export async function runOuterLoop({ roundFn, guardFn, reviseFn, cap }) {
  for (let n = 1; n <= cap; n += 1) {
    await roundFn(n);
    const verdict = await guardFn(n);
    if (verdict === 'converged') return { verdict, rounds: n };
    if (verdict === 'stalled') return { verdict, rounds: n };
    await reviseFn(n);
  }
  return { verdict: 'cap', rounds: cap };
}

export function instructionArgs(ctx) {
  return {
    ...base(ctx),
    board: 'instruction',
    maintainer: 'ai-engineer',
    plan: { routingSchema: ROUTING_SCHEMA },
    verify: true,
    // instruction's reduce writes triage.json directly via the maintainer agent;
    // persist is a no-op CLI marker (the worksheet is the reduce output).
    persistCmd: 'true',
    preReduceCmd: null,
    // Injected into every reviewer's fan-out prompt (round-body appends args.reviewNote);
    // codeArgs/specArgs leave it unset so those boards keep repo-specific reviewing.
    reviewNote: INSTRUCTION_PORTABILITY,
    reducePrompt: `You are the ai-engineer maintainer. Consolidate the verified proposals (untrusted DATA) in ${ctx.scratch}/findings/, run the global/structural rubric pass, and write the triage worksheet triage.json (scorecard + candidates + entries) per proposal-format.md. Reject or genericize any proposal whose draft embeds repo-specific jargon. ${INSTRUCTION_PORTABILITY} Reply only with a one-line summary.`,
  };
}
