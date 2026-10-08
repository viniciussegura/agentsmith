#!/usr/bin/env node
// agentsmith PreToolUse hook (#git-branch-workflow): a commit-creating git command on the
// default branch is blocked. Matched on the Bash and PowerShell tools. Parsing contract, exit
// codes, opt-out, and non-coverage are in _lib.mjs.
import { resolve } from 'node:path';
import { runHook, parseCommand, gitInvocation, resolveDir, runGit, notice } from './_lib.mjs';

const HOOK = 'guard-default-branch';
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
const COMMIT_CREATING = new Set(['commit', 'merge', 'cherry-pick', 'revert', 'am', 'rebase']);
// Forms of those subcommands that create no commit: they unwind or abandon an operation in
// progress, which an agent must be able to do on any branch. `--continue` and `--skip` go on
// to create commits and stay blocked.
const COMMIT_FREE_FLAGS = new Set(['--abort', '--quit']);
// `merge --ff-only` is allowed only from a remote-tracking operand: updating the default branch
// before branching is what the workflow asks for, landing a local branch onto it is the human's.
const REMOTE_OPERAND = /^(?:[A-Za-z0-9_.-]+\/[^\s]+|@\{u(?:pstream)?\}|FETCH_HEAD)$/;
const fastForwardsFromRemote = (args) =>
  args.includes('--ff-only') && args.some((a) => !a.startsWith('-') && REMOTE_OPERAND.test(a));
const DIR_ENV = ['GIT_DIR', 'GIT_WORK_TREE'];
const DEFAULT_CANDIDATES = ['main', 'master'];

// The default branch: origin/HEAD, else the first of init.defaultBranch, main, master that
// exists as a local branch (a configured name no branch carries protects nothing); null when
// none resolves.
function defaultBranch(dir) {
  const origin = runGit(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], dir);
  if (origin.timedOut) return { timedOut: true };
  if (origin.ok && origin.out) return { name: origin.out.replace(/^origin\//, '') };
  const configured = runGit(['config', '--get', 'init.defaultBranch'], dir);
  if (configured.timedOut) return { timedOut: true };
  const candidates = [...(configured.ok && configured.out ? [configured.out] : []), ...DEFAULT_CANDIDATES];
  for (const name of candidates) {
    const exists = runGit(['rev-parse', '--verify', '--quiet', `refs/heads/${name}`], dir);
    if (exists.timedOut) return { timedOut: true };
    if (exists.ok) return { name };
  }
  return { name: null };
}

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
    if (!COMMIT_CREATING.has(inv.sub)) return;
    if (inv.sub === 'merge' && fastForwardsFromRemote(inv.args)) return;
    if (inv.args.some((a) => COMMIT_FREE_FLAGS.has(a))) return;
    if (inv.dirOverride || DIR_ENV.some((k) => parsed.env.has(k))) {
      verdict.notices.push(notice(HOOK, 'a git command whose repository is chosen by --git-dir, --work-tree, or their environment variables'));
      return;
    }
    const where = resolveDir(inv, i, parsed.segments, cwd, resolve);
    if (where.undecidable) { verdict.notices.push(notice(HOOK, where.undecidable)); return; }
    const dir = where.dir;
    verdict.dir = verdict.dir || dir;

    const inside = runGit(['rev-parse', '--is-inside-work-tree'], dir);
    if (inside.timedOut) { verdict.notices.push(notice(HOOK, 'the repository state (git timed out)')); return; }
    if (!inside.ok) { verdict.notices.push(notice(HOOK, 'a directory that is not a git repository')); return; }
    const head = runGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], dir);
    if (head.timedOut) { verdict.notices.push(notice(HOOK, 'the current branch (git timed out)')); return; }
    if (!head.ok) return; // detached HEAD: no branch to protect
    const born = runGit(['rev-parse', '--verify', '--quiet', 'HEAD'], dir);
    if (born.timedOut) { verdict.notices.push(notice(HOOK, 'the current branch (git timed out)')); return; }
    if (!born.ok) return; // unborn branch: the first commit necessarily lands on the default branch
    const def = defaultBranch(dir);
    if (def.timedOut) { verdict.notices.push(notice(HOOK, 'the default branch (git timed out)')); return; }
    if (!def.name) { verdict.notices.push(notice(HOOK, 'the default branch (no origin/HEAD, init.defaultBranch, main, or master)')); return; }
    if (head.out === def.name) {
      verdict.blocks.push(`Blocked by #git-branch-workflow: never commit on the default branch (${def.name}); create a branch first.`);
    }
  });
  if (parsed.unterminated && sawGit) verdict.notices.push(notice(HOOK, 'a segment with an unterminated quote'));
  if (!verdict.dir) verdict.dir = cwd;
});
