#!/usr/bin/env node
// agentsmith PreToolUse hook (#git-branch-workflow, #git-tooling): a git command with a force
// flag or a hook-skipping flag is blocked. Matched on the Bash and PowerShell tools. Parsing
// contract, exit codes, opt-out, and non-coverage are in _lib.mjs.
import { resolve } from 'node:path';
import { runHook, parseCommand, gitInvocation, gitFlagsViolation, resolveDir, notice } from './_lib.mjs';

const HOOK = 'guard-git-flags';
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

runHook(HOOK, (payload, verdict) => {
  if (!SHELL_TOOLS.has(payload.tool_name)) return;
  const command = payload.tool_input?.command;
  if (typeof command !== 'string') return;
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
  const parsed = parseCommand(command, { powershell: payload.tool_name === 'PowerShell' });
  let sawGit = false;
  parsed.segments.forEach((segment, i) => {
    const inv = gitInvocation(segment);
    if (!inv) return;
    sawGit = true;
    const kind = gitFlagsViolation(inv, parsed.env);
    if (!kind) return;
    verdict.blocks.push(
      `Blocked by #git-branch-workflow and #git-tooling: ${kind} is never passed by the agent. ` +
        'Stop and ask the user, who runs the command; the one sanctioned rewrite (#git-secret-history) is run by the user, never by the agent.',
    );
    if (!verdict.dir) { const where = resolveDir(inv, i, parsed.segments, cwd, resolve); verdict.dir = where.dir ?? cwd; }
  });
  if (parsed.unterminated && sawGit) verdict.notices.push(notice(HOOK, 'a segment with an unterminated quote'));
  if (!verdict.dir) verdict.dir = cwd;
});
