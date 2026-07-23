import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirm, runWizard } from '../src/prompt.js';

const seamWith = (isTTY, answers) => {
  const q = [...answers];
  return { isTTY, ask: async () => q.shift() };
};
const plan = { ops: [] };
const render = () => 'PLAN';

test('dry-run -> skip', async () => {
  assert.equal(await confirm({ plan, seam: seamWith(true, []), yes: false, dryRun: true, destructive: false, render }), 'skip');
});
test('--yes -> apply', async () => {
  assert.equal(await confirm({ plan, seam: seamWith(false, []), yes: true, dryRun: false, destructive: true, render }), 'apply');
});
test('TTY prompt y -> apply, n -> skip', async () => {
  assert.equal(await confirm({ plan, seam: seamWith(true, ['y']), yes: false, dryRun: false, destructive: false, render }), 'apply');
  assert.equal(await confirm({ plan, seam: seamWith(true, ['n']), yes: false, dryRun: false, destructive: false, render }), 'skip');
});
test('non-TTY non-destructive -> apply; destructive -> abort', async () => {
  assert.equal(await confirm({ plan, seam: seamWith(false, []), yes: false, dryRun: false, destructive: false, render }), 'apply');
  assert.equal(await confirm({ plan, seam: seamWith(false, []), yes: false, dryRun: false, destructive: true, render }), 'abort');
});

test('wizard install path yields a parseable Command', async () => {
  // verb, scope, mode, placement, tools, dev
  const seam = seamWith(true, ['install', 'user', 'split', 'nested', 'y', 'n']);
  const cmd = await runWizard(seam);
  assert.equal(cmd.kind, 'install');
  assert.deepEqual(cmd.scope, { kind: 'user' });
  assert.equal(cmd.flags.tools, true);
  assert.equal(cmd.flags.dev, false);
});

test('wizard uninstall path skips install-only prompts', async () => {
  const seam = seamWith(true, ['uninstall', 'project']);
  const cmd = await runWizard(seam);
  assert.equal(cmd.kind, 'uninstall');
  assert.deepEqual(cmd.scope, { kind: 'project' });
});
