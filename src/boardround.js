// Renders the self-contained board-round.mjs Workflow script from round-body.mjs.
// A Workflow script must be self-contained: `export const meta` first, no import, no
// second `export` (the runtime evals everything after meta in a non-module scope), and
// the `args` global arrives as a JSON string. So we prepend meta, strip the `export`
// from runRound, and append a guard that JSON-parses args and runs the round only when
// the Workflow runtime supplies the `agent` global. Pure: text in, text out.
// bin/build-board-round.js drives it; a drift test keeps the committed file current.

const META = `export const meta = {
  name: 'board-round',
  description: 'Run one review-board round (any board) deterministically: plan, fan-out, verify, reduce, persist.',
  phases: [{ title: 'Plan' }, { title: 'Review' }, { title: 'Verify' }, { title: 'Reduce' }, { title: 'Persist' }],
};`;

const GUARD = `// --- live Workflow entry: runs only under the Workflow runtime (the \`agent\` global).
// The runtime delivers \`args\` as a JSON string; parse it before handing runRound a plain object.
// eslint-disable-next-line no-undef
if (typeof agent === 'function') {
  // eslint-disable-next-line no-undef
  await runRound({ agent, parallel, phase, log, args: typeof args === 'string' ? JSON.parse(args) : args });
}`;

// Render the generated board-round.mjs text from the round-body.mjs source text.
export function renderBoardRound(bodySource) {
  const body = bodySource.replace(/^export async function runRound/m, 'async function runRound').trimEnd();
  return [
    '// GENERATED from round-body.mjs by bin/build-board-round.js -- DO NOT EDIT.',
    '// Edit round-body.mjs (the tested source) and run `npm run build:board-round`.',
    '',
    META,
    '',
    body,
    '',
    GUARD,
    '',
  ].join('\n');
}
