import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSettings, agentsmithHooks, hasOwnedHooks, HOOKS_DIR_REL, HOOKS, HOOK_FILES } from '../src/settings.js';

const owned = agentsmithHooks(HOOKS_DIR_REL);
const commandFor = (script) => `node "${HOOKS_DIR_REL}/${script}"`;
const AGENT_COMMAND = commandFor('require-explicit-model.mjs');

test('agentsmithHooks emits one owned entry per hook, in list order, with its matcher', () => {
  assert.equal(owned.PreToolUse.length, HOOKS.length);
  owned.PreToolUse.forEach((entry, i) => {
    assert.equal(entry.matcher, HOOKS[i].matcher);
    assert.deepEqual(entry.hooks, [{ type: 'command', command: commandFor(HOOKS[i].script) }]);
  });
  assert.deepEqual(HOOK_FILES, HOOKS.map((h) => `${HOOKS_DIR_REL}/${h.script}`));
});

test('agentsmithHooks normalizes backslashes in the hooks directory', () => {
  const h = agentsmithHooks('.claude\\hooks\\agentsmith');
  assert.equal(h.PreToolUse[0].matcher, 'Agent');
  assert.equal(h.PreToolUse[0].hooks[0].command, AGENT_COMMAND);
});

test('quotes the hook path so a base dir with a space survives shell splitting', () => {
  const h = agentsmithHooks('C:\\Users\\John Doe\\.claude\\hooks\\agentsmith');
  assert.equal(
    h.PreToolUse[0].hooks[0].command,
    'node "C:/Users/John Doe/.claude/hooks/agentsmith/require-explicit-model.mjs"',
  );
});

test('injects the hooks into empty/absent settings', () => {
  const next = mergeSettings(null, owned);
  assert.deepEqual(next.hooks.PreToolUse, owned.PreToolUse);
});

test('preserves unrelated user keys and user-authored hooks in the same event', () => {
  const existing = {
    permissions: { allow: ['Bash(ls *)'] },
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node my-guard.mjs' }] }] },
  };
  const next = mergeSettings(existing, owned);
  assert.deepEqual(next.permissions, existing.permissions);
  assert.equal(next.hooks.PreToolUse.length, 1 + HOOKS.length);
  assert.equal(next.hooks.PreToolUse[0].matcher, 'Bash'); // user's hook kept, first
  assert.equal(next.hooks.PreToolUse[1].hooks[0].command, AGENT_COMMAND);
});

test('idempotent: merging twice does not duplicate any owned hook', () => {
  const once = mergeSettings(null, owned);
  const twice = mergeSettings(once, owned);
  assert.deepEqual(twice, once);
  assert.equal(twice.hooks.PreToolUse.length, HOOKS.length);
});

test('replaces a prior agentsmith hook whose command path changed (abs <-> rel)', () => {
  const absCommand = 'node /home/u/.claude/hooks/agentsmith/require-explicit-model.mjs';
  const existing = { hooks: { PreToolUse: [{ matcher: 'Agent', hooks: [{ type: 'command', command: absCommand }] }] } };
  const next = mergeSettings(existing, owned);
  assert.equal(next.hooks.PreToolUse.length, HOOKS.length);
  assert.equal(next.hooks.PreToolUse[0].hooks[0].command, AGENT_COMMAND); // old abs entry replaced
});

test('deprecation: drops an owned entry from an event no longer owned, keeping user entries', () => {
  const existing = {
    hooks: {
      PostToolUse: [
        { matcher: 'Agent', hooks: [{ type: 'command', command: 'node .claude/hooks/agentsmith/old.mjs' }] },
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'node user.mjs' }] },
      ],
    },
  };
  const next = mergeSettings(existing, owned);
  assert.equal(next.hooks.PostToolUse.length, 1);
  assert.equal(next.hooks.PostToolUse[0].matcher, 'Bash');
});

test('deprecation: removes an event entirely when only an owned entry remains', () => {
  const existing = {
    hooks: { PostToolUse: [{ matcher: 'Agent', hooks: [{ type: 'command', command: 'node .claude/hooks/agentsmith/old.mjs' }] }] },
  };
  const next = mergeSettings(existing, owned);
  assert.equal('PostToolUse' in next.hooks, false);
});

test('tolerates a malformed hooks value', () => {
  const next = mergeSettings({ hooks: 'oops' }, owned);
  assert.deepEqual(next.hooks.PreToolUse, owned.PreToolUse);
});

test('hasOwnedHooks detects our entry, ignores absent/user-only/malformed settings', () => {
  assert.equal(hasOwnedHooks(null), false);
  assert.equal(hasOwnedHooks({}), false);
  assert.equal(hasOwnedHooks({ hooks: 'oops' }), false);
  assert.equal(hasOwnedHooks({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node user.mjs' }] }] } }), false);
  assert.equal(hasOwnedHooks(mergeSettings(null, owned)), true);
});

test('mergeSettings(existing, {}) removes every agentsmith hook, keeps user hooks', () => {
  const withOurs = mergeSettings(
    { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'user-thing' }] }] } },
    owned,
  );
  const unmerged = mergeSettings(withOurs, {});
  const entries = unmerged.hooks.PreToolUse || [];
  assert.ok(entries.some((e) => e.matcher === 'Bash' && e.hooks[0].command === 'user-thing'), 'user hook preserved');
  assert.ok(!entries.some((e) => e.hooks?.some((h) => h.command.includes('/hooks/agentsmith/'))), 'agentsmith hooks removed');
});
