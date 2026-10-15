const norm = (p) => p.replace(/\\/g, '/');

// Project-relative directory of the hook scripts, installed as a tool adapter from
// tools/claude/hooks/agentsmith/ -> .claude/hooks/agentsmith/.
export const HOOKS_DIR_REL = '.claude/hooks/agentsmith';

// The hooks agentsmith owns and the tool each one matches. The matcher is the tool the
// rule's subject passes through: `Agent` is the model-capable dispatch tool (stock Claude
// Code's `Task` exposes no `model` parameter, so matching it would block every dispatch);
// the two git guards read a shell command from either shell tool; the marker guard reads
// an edit. Order is the order the entries land in settings.json and plugin.json.
export const HOOKS = [
  { script: 'require-explicit-model.mjs', matcher: 'Agent' },
  { script: 'guard-default-branch.mjs', matcher: 'Bash|PowerShell' },
  { script: 'guard-git-flags.mjs', matcher: 'Bash|PowerShell' },
  { script: 'guard-dated-todos.mjs', matcher: 'Write|Edit|MultiEdit' },
];

// Project-relative paths of the hook scripts.
export const HOOK_FILES = HOOKS.map((h) => `${HOOKS_DIR_REL}/${h.script}`);

// The committed per-project opt-out the hooks read at HEAD; `install` only probes that
// it is not gitignored, since an ignored copy is never committed and does nothing.
export const HOOKS_OPT_OUT_REL = '.agentsmith/hooks.yaml';

// Base-relative locations of the two adapter files agentsmith edits (rather than
// owns): the settings.json it merges its hook into, and the CLAUDE.md it wires a
// user-scope import into. Centralized so a rename lands in one place (#code-style).
export const SETTINGS_REL = '.claude/settings.json';
export const CLAUDE_MD_REL = '.claude/CLAUDE.md';

// Ownership marker. Every hook command agentsmith injects points at a script under
// this path segment, so on reinstall we identify our own prior entries by the path
// alone -- no separate manifest to keep in sync. The path *is* the provenance.
//
// Boundary: this only works for settings that carry a path (hooks do). The day
// agentsmith manages a non-hook key (an env var, a permission) -- which has no path
// to mark -- this needs a real ownership manifest. Hooks-only today, so we don't.
const OWNED_MARKER = '/hooks/agentsmith/';

/**
 * The PreToolUse hooks agentsmith owns, with each command resolved under `hooksDir`.
 * Project installs pass the project-relative directory (Claude Code runs hooks from the
 * project root); user installs pass an absolute one (a user hook's cwd is whatever
 * project is active, not the home dir). Pure.
 *
 * @param {string} hooksDir  Directory holding the hook scripts (any slash form).
 * @returns {object}  event -> entry[] map.
 */
export function agentsmithHooks(hooksDir) {
  return {
    PreToolUse: HOOKS.map(({ script, matcher }) => ({
      matcher,
      // Quote the path: a user-scope install writes an absolute path, and a home
      // dir with a space (`C:\Users\John Doe\...`, OneDrive-redirected paths) would
      // otherwise split at the shell and the hook silently never fires.
      hooks: [{ type: 'command', command: `node "${norm(hooksDir)}/${script}"` }],
    })),
  };
}

const isOwned = (entry) =>
  Array.isArray(entry?.hooks) &&
  entry.hooks.some(
    (h) => typeof h?.command === 'string' && norm(h.command).includes(OWNED_MARKER),
  );

/**
 * True when a parsed settings object carries at least one agentsmith-owned hook.
 * Lets the caller skip a no-op un-merge (which would re-serialize settings.json and
 * print a misleading "remove agentsmith hook" line) when nothing of ours is present.
 *
 * @param {object|null} existing  Parsed settings.json, or null when absent.
 * @returns {boolean}
 */
export function hasOwnedHooks(existing) {
  const hooks = existing && typeof existing === 'object' ? existing.hooks : null;
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) return false;
  return Object.values(hooks).some((entries) => Array.isArray(entries) && entries.some(isOwned));
}

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
