#!/usr/bin/env node
// agentsmith PreToolUse hook (#ai-conversational): a subagent dispatch that omits an explicit
// model is blocked. This is the mechanical half of the rule -- the presence of a `model`, not
// "the cheapest that fits the task", which no hook can judge. Matched on the model-capable
// `Agent` tool only: stock Claude Code's `Task` tool exposes no `model` parameter, so matching
// it would block every dispatch. A fork always inherits the parent's model and ignores the
// parameter, so it passes. Exit codes, opt-out, and non-coverage are in _lib.mjs.
import { runHook } from './_lib.mjs';

const HOOK = 'require-explicit-model';
const INHERITS_MODEL = new Set(['fork']);

runHook(HOOK, (payload, verdict) => {
  if (payload.tool_name !== 'Agent') return;
  verdict.dir = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
  if (INHERITS_MODEL.has(payload.tool_input?.subagent_type)) return;
  const model = payload.tool_input?.model;
  if (typeof model === 'string' && model.trim() !== '') return;
  verdict.blocks.push(
    'Blocked by #ai-conversational: every subagent dispatch must state an explicit model (the cheapest that fits the task). ' +
      'Re-send the Agent call with the `model` parameter set; omitting it to inherit a default requires a stated reason.',
  );
});
