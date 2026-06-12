import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSettings, agentsmithHooks, HOOK_REL } from '../src/settings.js';

const owned = agentsmithHooks(HOOK_REL);
const command = `node ${HOOK_REL}`;

test('agentsmithHooks normalizes backslashes and matches the Agent tool', () => {
  const h = agentsmithHooks('.claude\\hooks\\agentsmith\\require-explicit-model.mjs');
  assert.equal(h.PreToolUse[0].matcher, 'Agent');
  assert.equal(h.PreToolUse[0].hooks[0].command, 'node .claude/hooks/agentsmith/require-explicit-model.mjs');
});

test('injects the hook into empty/absent settings', () => {
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
  assert.equal(next.hooks.PreToolUse.length, 2);
  assert.equal(next.hooks.PreToolUse[0].matcher, 'Bash'); // user's hook kept, first
  assert.equal(next.hooks.PreToolUse[1].hooks[0].command, command);
});

test('idempotent: merging twice does not duplicate the owned hook', () => {
  const once = mergeSettings(null, owned);
  const twice = mergeSettings(once, owned);
  assert.deepEqual(twice, once);
  assert.equal(twice.hooks.PreToolUse.filter((e) => e.matcher === 'Agent').length, 1);
});

test('replaces a prior agentsmith hook whose command path changed (abs <-> rel)', () => {
  const absCommand = 'node /home/u/.claude/hooks/agentsmith/require-explicit-model.mjs';
  const existing = { hooks: { PreToolUse: [{ matcher: 'Agent', hooks: [{ type: 'command', command: absCommand }] }] } };
  const next = mergeSettings(existing, owned);
  assert.equal(next.hooks.PreToolUse.length, 1);
  assert.equal(next.hooks.PreToolUse[0].hooks[0].command, command); // old abs entry replaced
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
