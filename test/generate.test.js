import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../src/generate.js';

test('concatenates preamble then modules in order', () => {
  const out = generate({
    preamble: 'PREAMBLE',
    modules: ['ALPHA', 'BETA'],
    source: 'github.com/example/agentsmith',
  });

  const iPre = out.indexOf('PREAMBLE');
  const iA = out.indexOf('ALPHA');
  const iB = out.indexOf('BETA');

  assert.ok(iPre !== -1 && iA !== -1 && iB !== -1, 'all content present');
  assert.ok(iPre < iA && iA < iB, 'order is preamble, then modules as given');
});

test('prepends a do-not-edit header naming the source', () => {
  const out = generate({
    preamble: 'P',
    modules: ['M'],
    source: 'github.com/example/agentsmith',
  });

  const header = out.slice(0, out.indexOf('P'));
  assert.match(header, /generated/i, 'header marks file as generated');
  assert.match(header, /do not edit/i, 'header warns against editing');
  assert.match(header, /github\.com\/example\/agentsmith/, 'header names the source');
});

test('separates blocks with a blank line so markdown does not collide', () => {
  const out = generate({
    preamble: 'P',
    modules: ['A', 'B'],
    source: 's',
  });

  assert.match(out, /P\n\nA/, 'preamble and first module separated by blank line');
  assert.match(out, /A\n\nB/, 'modules separated by blank line');
});

test('handles zero modules', () => {
  const out = generate({ preamble: 'ONLY', modules: [], source: 's' });
  assert.ok(out.includes('ONLY'));
});

test('trims trailing whitespace from each block before joining', () => {
  const out = generate({
    preamble: 'P\n\n',
    modules: ['A\n  \n'],
    source: 's',
  });
  assert.ok(!/\n{3,}/.test(out), 'no runs of 3+ newlines');
});
