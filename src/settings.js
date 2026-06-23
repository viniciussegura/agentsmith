const norm = (p) => p.replace(/\\/g, '/');

// Project-relative location of the model-enforcement hook script, installed as a
// tool adapter under tools/claude/hooks/agentsmith/ -> .claude/hooks/agentsmith/.
export const HOOK_REL = '.claude/hooks/agentsmith/require-explicit-model.mjs';

// Ownership marker. Every hook command agentsmith injects points at a script under
// this path segment, so on reinstall we identify our own prior entries by the path
// alone -- no separate manifest to keep in sync. The path *is* the provenance.
//
// Boundary: this only works for settings that carry a path (hooks do). The day
// agentsmith manages a non-hook key (an env var, a permission) -- which has no path
// to mark -- this needs a real ownership manifest. Hooks-only today, so we don't.
const OWNED_MARKER = '/hooks/agentsmith/';

/**
 * The PreToolUse hooks agentsmith owns, with their command resolved to `commandPath`.
 * Project installs pass a project-relative path (Claude Code runs hooks from the
 * project root); user installs pass an absolute path (a user hook's cwd is whatever
 * project is active, not the home dir). Pure.
 *
 * Matcher is `Agent` -- the model-capable dispatch tool. Stock Claude Code's `Task`
 * tool exposes no `model` parameter, so matching it would block every dispatch; we
 * deliberately do not.
 *
 * @param {string} commandPath  Path to the hook script (any slash form).
 * @returns {object}  event -> entry[] map.
 */
export function agentsmithHooks(commandPath) {
  return {
    PreToolUse: [
      {
        matcher: 'Agent',
        hooks: [{ type: 'command', command: `node ${norm(commandPath)}` }],
      },
    ],
  };
}

const isOwned = (entry) =>
  Array.isArray(entry?.hooks) &&
  entry.hooks.some(
    (h) => typeof h?.command === 'string' && norm(h.command).includes(OWNED_MARKER),
  );

/**
 * Merge agentsmith's owned hooks into an existing settings object. Pure: no disk access.
 *
 * Idempotent and self-deprecating: strips every prior agentsmith-owned entry (matched
 * by the command path marker) before re-injecting the current set, so reinstalling
 * never duplicates and a hook dropped from a newer version is removed. User-authored
 * keys and user-authored hooks are preserved untouched.
 *
 * @param {object|null} existing  Parsed settings.json, or null/{} when absent.
 * @param {object} owned  event -> entry[] map to inject (from agentsmithHooks).
 * @returns {object}  New settings object to write.
 */
export function mergeSettings(existing, owned) {
  const next = existing && typeof existing === 'object' ? { ...existing } : {};
  const hooks =
    next.hooks && typeof next.hooks === 'object' && !Array.isArray(next.hooks)
      ? { ...next.hooks }
      : {};

  // Re-inject owned events: keep the user's entries, append ours.
  for (const [event, entries] of Object.entries(owned)) {
    const prior = Array.isArray(hooks[event]) ? hooks[event] : [];
    hooks[event] = [...prior.filter((e) => !isOwned(e)), ...entries];
  }

  // Deprecation sweep: drop our entries from events we no longer own.
  for (const event of Object.keys(hooks)) {
    if (owned[event] || !Array.isArray(hooks[event])) continue;
    const kept = hooks[event].filter((e) => !isOwned(e));
    if (kept.length) hooks[event] = kept;
    else delete hooks[event];
  }

  next.hooks = hooks;
  return next;
}
