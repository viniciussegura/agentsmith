import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, demoteHeadings } from '../src/generate.js';

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

test('header records the source commit and date when provided', () => {
  const out = generate({
    preamble: 'P',
    modules: ['M'],
    source: 'github.com/example/agentsmith',
    commit: 'abc1234',
    date: '2026-05-22',
  });

  const header = out.slice(0, out.indexOf('P'));
  assert.match(header, /abc1234/, 'header names the source commit');
  assert.match(header, /2026-05-22/, 'header names the source date');
});

test('header omits the revision line when no commit is provided', () => {
  const out = generate({ preamble: 'P', modules: ['M'], source: 's' });

  const header = out.slice(0, out.indexOf('P'));
  assert.doesNotMatch(header, /revision/i, 'no revision line without a commit');
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

test('demotes module headings by one level so only the preamble owns an h1', () => {
  const out = generate({
    preamble: '# Agent instructions\n\nIntro.',
    modules: ['# Software engineering\n\n## #swe-done Definition'],
    source: 's',
  });

  assert.match(out, /^# Agent instructions$/m, 'preamble h1 is preserved');
  assert.match(out, /^## Software engineering$/m, 'module h1 becomes h2');
  assert.match(out, /^### #swe-done Definition$/m, 'module h2 becomes h3');
  assert.doesNotMatch(out, /^# Software engineering$/m, 'no module h1 remains');
});

test('does not demote headings inside fenced code blocks', () => {
  const out = generate({
    preamble: 'P',
    modules: ['# Title\n\n```md\n# Not a heading\n```'],
    source: 's',
  });

  assert.match(out, /^## Title$/m, 'real heading demoted');
  assert.match(out, /^# Not a heading$/m, 'fenced content untouched');
});

test('demoteHeadings shifts by N levels and clamps at h6', () => {
  assert.equal(demoteHeadings('# A', 2), '### A');
  assert.equal(demoteHeadings('## B', 2), '#### B');
  assert.equal(demoteHeadings('##### E', 2), '###### E'); // clamp 5+2 -> 6
  assert.equal(demoteHeadings('###### F', 2), '###### F'); // already h6
  assert.equal(demoteHeadings('# A', 1), '## A');
});

test('demoteHeadings leaves fenced headings untouched at by=2', () => {
  const out = demoteHeadings('# T\n\n```md\n# X\n```', 2);
  assert.match(out, /^### T$/m);
  assert.match(out, /^# X$/m);
});

test('generate accepts {text, demote} module items', () => {
  const out = generate({
    preamble: '# Root',
    modules: [
      { text: '# Group\n\nprose', demote: 1 },
      { text: '# #tag Title\n\nbody', demote: 2 },
    ],
    source: 's',
  });
  assert.match(out, /^# Root$/m);
  assert.match(out, /^## Group$/m);      // _intro: h1 -> h2
  assert.match(out, /^### #tag Title$/m); // tag: h1 -> h3
});

test('generate still accepts plain-string modules (demote 1)', () => {
  const out = generate({ preamble: '# R', modules: ['# G\n\nx'], source: 's' });
  assert.match(out, /^## G$/m);
});
