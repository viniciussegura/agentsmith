import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineDiff } from '../devtools/triage-ui/diff.mjs';

test('identical text -> all same', () => {
  const rows = lineDiff('a\nb\nc', 'a\nb\nc');
  assert.deepEqual(rows, [
    { type: 'same', text: 'a' },
    { type: 'same', text: 'b' },
    { type: 'same', text: 'c' },
  ]);
});

test('empty current (new-rule) -> all add', () => {
  assert.deepEqual(lineDiff('', 'x\ny'), [
    { type: 'add', text: 'x' },
    { type: 'add', text: 'y' },
  ]);
  assert.deepEqual(lineDiff(null, 'x'), [{ type: 'add', text: 'x' }]);
});

test('empty draft -> all del', () => {
  assert.deepEqual(lineDiff('x\ny', ''), [
    { type: 'del', text: 'x' },
    { type: 'del', text: 'y' },
  ]);
});

test('a changed middle line -> del + add around shared lines', () => {
  const rows = lineDiff('head\nold\ntail', 'head\nnew\ntail');
  assert.deepEqual(rows, [
    { type: 'same', text: 'head' },
    { type: 'del', text: 'old' },
    { type: 'add', text: 'new' },
    { type: 'same', text: 'tail' },
  ]);
});

test('an inserted line keeps surrounding lines as same', () => {
  const rows = lineDiff('a\nc', 'a\nb\nc');
  assert.deepEqual(rows, [
    { type: 'same', text: 'a' },
    { type: 'add', text: 'b' },
    { type: 'same', text: 'c' },
  ]);
});

test('trailing newlines do not add phantom blank rows', () => {
  // current (read from disk) ends in '\n'; draft (textarea) does not.
  const rows = lineDiff('a\nb\n', 'a\nb');
  assert.deepEqual(rows, [
    { type: 'same', text: 'a' },
    { type: 'same', text: 'b' },
  ]);
});

test('round-trip of the line types covers every row', () => {
  const rows = lineDiff('a\nb', 'a\nx');
  assert.equal(rows.filter((r) => r.type === 'same').length, 1);
  assert.equal(rows.filter((r) => r.type === 'del').length, 1);
  assert.equal(rows.filter((r) => r.type === 'add').length, 1);
});
