import { test } from 'node:test';
import assert from 'node:assert/strict';
import { userImport } from '../src/userimport.js';

const TARGET = 'C:/Users/you/.agentsmith/AGENTS.md';
const LINE = `@${TARGET}`;
const MARKER = '<!-- agentsmith: generated user instructions -->';

test('missing file returns the block', () => {
  const out = userImport(null, TARGET);
  assert.equal(out, `${MARKER}\n${LINE}\n`);
});

test('file lacking the import appends with a blank-line separator, prior content intact', () => {
  const out = userImport('# my notes\n', TARGET);
  assert.match(out, /^# my notes\n/, 'prior content preserved');
  assert.match(out, /# my notes\n\n<!-- agentsmith/, 'blank line before the block');
  assert.ok(out.endsWith(`${LINE}\n`), 'ends with the import line + newline');
});

test('file without a trailing newline is not fused onto the block', () => {
  const out = userImport('last line no newline', TARGET);
  assert.match(out, /last line no newline\n\n<!-- agentsmith/);
});

test('exact import line already present -> null', () => {
  assert.equal(userImport(`# x\n${LINE}\n`, TARGET), null);
});

test('absolute @-line resolving to target (backslashes) -> null', () => {
  const existing = '@C:\\Users\\you\\.agentsmith\\AGENTS.md\n';
  assert.equal(userImport(existing, TARGET), null);
});

test('CRLF file already importing the target -> null (no duplicate)', () => {
  const existing = `# notes\r\n${LINE}\r\n`;
  assert.equal(userImport(existing, TARGET), null);
});

test('comment mentioning the path does not match -> appends', () => {
  const out = userImport(`# see ${TARGET} for rules\n`, TARGET);
  assert.notEqual(out, null);
  assert.ok(out.endsWith(`${LINE}\n`));
});

test('superstring path does not match -> appends', () => {
  assert.notEqual(userImport(`@${TARGET}.bak\n`, TARGET), null);
});

test('relative @-import does not match -> appends', () => {
  assert.notEqual(userImport('@../.agentsmith/AGENTS.md\n', TARGET), null);
});
