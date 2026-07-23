import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirm, runWizard, makeSeam } from '../src/prompt.js';

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

test('makeSeam keys isTTY off stdin (the stream ask() reads), not stdout', () => {
  const inTTY = process.stdin.isTTY;
  const outTTY = process.stdout.isTTY;
  try {
    process.stdin.isTTY = true;
    process.stdout.isTTY = false;
    assert.equal(makeSeam().isTTY, true, 'interactive stdin is detected even when stdout is redirected');
    process.stdin.isTTY = false;
    process.stdout.isTTY = true;
    assert.equal(makeSeam().isTTY, false, 'redirected stdin is not a TTY even when stdout is');
  } finally {
    process.stdin.isTTY = inTTY;
    process.stdout.isTTY = outTTY;
  }
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

test('an invalid verb answer aborts instead of silently defaulting to install', async () => {
  // two unrecognized verb answers -> one re-ask, then abort (never install)
  const seam = seamWith(true, ['nonsense', 'still-bad', 'user', 'split', 'nested', 'y', 'n']);
  const cmd = await runWizard(seam);
  assert.equal(cmd.kind, 'aborted');
});

test('an invalid mode answer aborts rather than picking a layout', async () => {
  const seam = seamWith(true, ['install', 'project', 'bogus', 'bogus']);
  const cmd = await runWizard(seam);
  assert.equal(cmd.kind, 'aborted');
});

test('a re-asked verb answer that is then valid proceeds', async () => {
  const seam = seamWith(true, ['', 'uninstall', 'project']);
  const cmd = await runWizard(seam);
  assert.equal(cmd.kind, 'uninstall');
});
