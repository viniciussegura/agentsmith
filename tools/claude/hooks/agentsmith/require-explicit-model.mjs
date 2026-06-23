#!/usr/bin/env node
// agentsmith PreToolUse hook (#ai-conversational).
//
// Rejects a subagent dispatch that omits an explicit model. This is the *mechanical*
// half of the rule -- the presence of a `model`, not "the cheapest that fits the task"
// (a judgement no hook can make). The rule's intent is that the dispatcher choose a
// model deliberately every time, instead of silently inheriting an expensive default.
//
// Matches only the model-capable `Agent` dispatch tool (wired via the `matcher` in
// settings.json). Stock Claude Code's `Task` tool exposes no `model` parameter, so it
// is never matched -- the rule is moot where a per-dispatch model cannot be set.
//
// Installed and wired automatically by `agentsmith` (src/settings.js). Owned by the
// path it lives under (.claude/hooks/agentsmith/), so a later install replaces it.

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let payload = {};
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    // Unparseable payload: fail open rather than block on a harness change.
    process.exit(0);
  }

  const model = payload?.tool_input?.model;
  if (typeof model === 'string' && model.trim() !== '') process.exit(0);

  process.stderr.write(
    'Blocked by #ai-conversational: every subagent dispatch must state an explicit ' +
      'model (the cheapest that fits the task). Re-send the Agent call with the `model` ' +
      'parameter set; omitting it to inherit a default requires a stated reason.\n',
  );
  process.exit(2);
});
