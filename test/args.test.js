import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/args.js';

test('bare argv -> wizard', () => {
  assert.equal(parseArgs([]).kind, 'wizard');
});

test('install defaults', () => {
  const c = parseArgs(['install']);
  assert.equal(c.kind, 'install');
  assert.deepEqual(c.scope, { kind: 'project' });
  assert.deepEqual(c.flags, { mode: 'split', placement: 'nested', tools: true, dev: false, clean: false, yes: false, dryRun: false });
});

test('scope user and path', () => {
  assert.deepEqual(parseArgs(['install', '--scope', 'user']).scope, { kind: 'user' });
  assert.deepEqual(parseArgs(['install', '--scope', './x']).scope, { kind: 'path', path: './x' });
});

test('mode/placement/flags map through', () => {
  const c = parseArgs(['install', '--mode', 'single', '--placement', 'root', '--no-tools', '--dev', '--clean', '--yes', '--dry-run']);
  assert.deepEqual(c.flags, { mode: 'single', placement: 'root', tools: false, dev: true, clean: true, yes: true, dryRun: true });
});

test('unknown flag is a hard error', () => {
  const c = parseArgs(['install', '----no-tools']);       // the reported typo
  assert.equal(c.kind, 'error');
  assert.match(c.error, /unknown flag/i);
});

test('--out is now unknown -> error', () => {
  assert.equal(parseArgs(['install', '--out', 'x']).kind, 'error');
});

test('conflicting scope value rejected', () => {
  assert.equal(parseArgs(['install', '--scope', 'user', '--scope', 'project']).kind, 'error');
});

test('--scope needs a value', () => {
  assert.equal(parseArgs(['install', '--scope']).kind, 'error');
});

test('a single-dash token is not swallowed as a flag value', () => {
  const c = parseArgs(['install', '--scope', '-h']);
  assert.equal(c.kind, 'error');
  assert.match(c.error, /requires a value/i);
});

test('stdout rejects disk flags, accepts --mode', () => {
  assert.equal(parseArgs(['--stdout', '--mode', 'single']).kind, 'stdout');
  assert.equal(parseArgs(['--stdout', '--scope', 'user']).kind, 'error');
});

test('uninstall parses scope + yes/dry-run only', () => {
  const c = parseArgs(['uninstall', '--scope', 'user', '--yes']);
  assert.equal(c.kind, 'uninstall');
  assert.equal(c.flags.yes, true);
  assert.equal(parseArgs(['uninstall', '--mode', 'single']).kind, 'error'); // install-only flag
});

test('help and version', () => {
  assert.equal(parseArgs(['--help']).kind, 'help');
  assert.equal(parseArgs(['-h']).kind, 'help');
  assert.equal(parseArgs(['install', '--help']).kind, 'help');
  assert.equal(parseArgs(['install', '--help']).helpVerb, 'install');
  assert.equal(parseArgs(['--version']).kind, 'version');
});

test('invalid --mode / --placement values are hard errors', () => {
  const m = parseArgs(['install', '--mode', 'xyz']);
  assert.equal(m.kind, 'error');
  assert.match(m.error, /--mode must be single\|split/);
  const p = parseArgs(['install', '--placement', 'xyz']);
  assert.equal(p.kind, 'error');
  assert.match(p.error, /--placement must be nested\|root/);
});

test('an unknown subcommand is a hard error', () => {
  const c = parseArgs(['foo']);
  assert.equal(c.kind, 'error');
  assert.match(c.error, /unknown subcommand: foo/);
});
