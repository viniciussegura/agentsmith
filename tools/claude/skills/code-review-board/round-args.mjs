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

const base = (ctx) => ({
  roundId: ctx.roundId,
  scratch: ctx.scratch,
  store: ctx.store,
  subjectRef: ctx.subjectRef,
  candidateLenses: ctx.candidateLenses ?? [],
});

export function codeArgs(ctx) {
  return {
    ...base(ctx),
    board: 'code',
    maintainer: 'project-manager',
    verify: true,
    persistCmd: `node .claude/skills/code-review-board/persist.mjs apply ${ctx.store} ${ctx.roundId}`,
  };
}

export function specArgs(ctx) {
  return {
    ...base(ctx),
    board: 'spec',
    maintainer: 'spec-specialist',
    verify: false,
    persistCmd: `node .claude/skills/spec-review-board/guard.mjs ${ctx.scratch} ${ctx.roundId}`,
  };
}

export function instructionArgs(ctx) {
  return {
    ...base(ctx),
    board: 'instruction',
    maintainer: 'ai-engineer',
    verify: true,
    // instruction's reduce writes triage.json directly via the maintainer agent;
    // persist is a no-op CLI marker (the worksheet is the reduce output).
    persistCmd: 'true',
  };
}
