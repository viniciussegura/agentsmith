#!/usr/bin/env node
// Resolve the two install-dependent values a round's args need, so the caller
// stops guessing them (#ai-review-engine).
//
//   node round-context.mjs            # prints {agentPrefix, skillsDir, cwd} as JSON
//
// Both defaults are wrong for one of the two supported installs, and the wrong
// value fails in a way that is either loud-and-fatal or silent-and-misleading:
//
//   agentPrefix  A plugin install registers agents under the plugin namespace
//                (`agentsmith:review-swe`); an npx/CLI install copies them BARE
//                into `.claude/agents/` (`planToolInstall` namespaces commands,
//                not agents). A bare dispatch under a plugin install dies with
//                `agent type not found` before the round starts.
//
//   skillsDir    Workflow subagents do not inherit the invoking worktree's cwd,
//                so a round command built as `node .claude/skills/...` resolves
//                against the wrong root and misses. This script reports the
//                absolute realpath of the skills root it is itself installed in,
//                which no cwd can invalidate.
//
// Zero dependency. Pure enough to unit-test: resolveContext() takes its two
// probes as inputs and touches no globals.

import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv, cwd, stdout } from 'node:process';
import { isMain } from './is-main.mjs';

// The agent whose presence is probed. `swe` is the always-on base lens, so it
// exists in every install that has agents at all.
const PROBE_AGENT = join('.claude', 'agents', 'review-swe.md');

// The namespace plugin-registered agents carry (plugin.json `name`).
const PLUGIN_PREFIX = 'agentsmith:';

/**
 * Decide the dispatch prefix and the skills root.
 *
 * The prefix keys off whether a BARE agent name would actually resolve -- i.e.
 * whether the project carries its own `.claude/agents/` copy -- rather than off
 * an install marker. That answers the operative question directly, and is right
 * in the both-installed case too: bare resolves, so bare is used.
 *
 * @param {{ hasProjectAgents: boolean, skillsDir: string, cwd: string }} probes
 * @returns {{ agentPrefix: string, skillsDir: string, cwd: string }}
 */
export function resolveContext({ hasProjectAgents, skillsDir, cwd: at }) {
  return {
    agentPrefix: hasProjectAgents ? '' : PLUGIN_PREFIX,
    skillsDir,
    cwd: at,
  };
}

// The skills root is this script's grandparent (<skills>/code-review-board/this),
// resolved through realpath so a symlinked `.claude/skills` reports the real
// location -- the one that stays valid regardless of the running cwd.
export function skillsRootOf(moduleUrl) {
  return realpathSync(dirname(dirname(fileURLToPath(moduleUrl))));
}

const invokedDirectly = isMain(import.meta.url, argv[1]);
if (invokedDirectly) {
  const at = cwd();
  const ctx = resolveContext({
    hasProjectAgents: existsSync(join(at, PROBE_AGENT)),
    skillsDir: skillsRootOf(import.meta.url),
    cwd: at,
  });
  stdout.write(`${JSON.stringify(ctx, null, 2)}\n`);
}
