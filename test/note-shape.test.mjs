import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');

// A note is read once, under time pressure, by someone answering one question (#code-prose); a note
// that outgrows this is history or evidence, which belong in the PR body, not a bigger note.
const MAX_LINES = 40;
const REMEDY = 'split the note, or move a long block to a reference-spec document or the PR body';

// Each note directory's template is the rule module's template sentence: one source line
// (#code-markdown) containing TEMPLATE_PHRASE, whose inline-code `## ...` spans are the headings;
// the span followed by OMITTABLE_MARK is optional. The rule text is the single source.
const NOTE_DIRS = [
  { dir: 'docs/future-work', module: 'instructions/core/swe/swe-future-work.md' },
  { dir: 'docs/technical-debts', module: 'instructions/core/swe/swe-technical-debts.md' },
];
const TEMPLATE_PHRASE = 'followed by the sections';
const OMITTABLE_MARK = '(omitted when there are none)';

const normalize = (text) => text.replace(/\r\n?/g, '\n');
const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SPAN = new RegExp(`\`(## [^\`]+)\`( ${escapeRegExp(OMITTABLE_MARK)})?`, 'g');

export function readTemplate(moduleText) {
  const candidates = normalize(moduleText).split('\n').filter((l) => l.includes(TEMPLATE_PHRASE));
  if (candidates.length !== 1) {
    throw new Error(`expected exactly one line containing "${TEMPLATE_PHRASE}", found ${candidates.length}`);
  }
  const headings = [...candidates[0].matchAll(SPAN)].map((m) => ({ text: m[1], required: !m[2] }));
  if (headings.length === 0) throw new Error('the template sentence names no `## ...` span');
  const texts = headings.map((h) => h.text);
  if (new Set(texts).size !== texts.length) throw new Error(`the template repeats a heading: ${texts.join(', ')}`);
  return headings;
}

// Every violation found in one note's text, each naming the check, the limit, and the remedy
// where one applies. Headings inside fenced code are not headings.
export function noteProblems(text, template) {
  const problems = [];
  const lines = normalize(text).replace(/\n$/, '').split('\n');
  if (lines.length > MAX_LINES) problems.push(`${lines.length} lines, the cap is ${MAX_LINES}: ${REMEDY}`);

  const headings = [];
  let fenced = false;
  lines.forEach((line, i) => {
    if (/^```/.test(line)) { fenced = !fenced; return; }
    if (fenced) return;
    const m = /^(#+) \S/.exec(line);
    if (m) headings.push({ level: m[1].length, text: line, line: i + 1 });
  });

  if (!/^# \S/.test(lines[0])) problems.push('line 1 is not an H1 title');
  const secondH1 = headings.find((h) => h.level === 1 && h.line !== 1);
  if (secondH1) problems.push(`a second H1 at line ${secondH1.line}; a note has one title`);
  const deeper = headings.find((h) => h.level > 2);
  if (deeper) problems.push(`a heading deeper than H2 at line ${deeper.line}; only the template's sections are allowed`);
  const firstBody = lines.findIndex((l, i) => i > 0 && l.trim() !== '');
  if (firstBody !== -1 && !/^## /.test(lines[firstBody])) {
    problems.push(`prose before the first section at line ${firstBody + 1}; the title is followed directly by a section`);
  }

  const allowed = template.map((t) => t.text);
  const h2 = headings.filter((h) => h.level === 2).map((h) => h.text);
  for (const h of h2) if (!allowed.includes(h)) problems.push(`heading outside the template: ${h}; allowed: ${allowed.join(', ')}`);
  for (const t of template) if (t.required && !h2.includes(t.text)) problems.push(`missing required heading: ${t.text}`);
  const expectedOrder = allowed.filter((a) => h2.includes(a));
  const actualOrder = h2.filter((h) => allowed.includes(h));
  if (actualOrder.join('|') !== expectedOrder.join('|')) {
    problems.push(`headings out of template order: ${actualOrder.join(', ')}; expected ${expectedOrder.join(', ')}`);
  }
  return problems;
}

const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

for (const { dir, module } of NOTE_DIRS) {
  test(`every note under ${dir} fits its template and the ${MAX_LINES}-line cap`, () => {
    const template = readTemplate(read(module));
    const notes = readdirSync(resolve(root, dir)).filter((f) => f.endsWith('.md')).sort();
    assert.ok(notes.length > 0, `${dir} yielded no notes; the walk is looking in the wrong place`);
    const failures = notes.flatMap((f) => noteProblems(read(join(dir, f)), template).map((p) => `${dir}/${f}: ${p}`));
    assert.deepEqual(failures, [], failures.join('\n'));
  });
}

test('the future-work template is three headings with Constraints omittable', () => {
  const t = readTemplate(read('instructions/core/swe/swe-future-work.md'));
  assert.deepEqual(t, [
    { text: '## What', required: true },
    { text: '## Why it matters', required: true },
    { text: '## Constraints', required: false },
  ]);
});

test('the technical-debt template is four headings, none omittable', () => {
  const t = readTemplate(read('instructions/core/swe/swe-technical-debts.md'));
  assert.deepEqual(t.map((h) => h.text), ['## The debt', '## Why accepted', '## Cost / risk', '## Remediation sketch']);
  assert.ok(t.every((h) => h.required));
});

test('template extraction fails on a repeated span, no span, no template sentence, or two', () => {
  const sentence = (spans) => `A note is an H1 title followed by the sections ${spans}, in that order.\n`;
  assert.throws(() => readTemplate(sentence('`## A`, `## B`, and `## A`')), /repeats a heading/);
  assert.throws(() => readTemplate(sentence('What, Why, and Constraints')), /names no/);
  assert.throws(() => readTemplate('A rule with no template sentence.\n'), /found 0/);
  assert.throws(() => readTemplate(sentence('`## A`') + sentence('`## B`')), /found 2/);
});

const FUTURE = [
  { text: '## What', required: true },
  { text: '## Why it matters', required: true },
  { text: '## Constraints', required: false },
];
const DEBT = ['## The debt', '## Why accepted', '## Cost / risk', '## Remediation sketch'].map((text) => ({ text, required: true }));
const section = (h, body = 'x') => `${h}\n\n${body}\n`;
const conforming = `# Title\n\n${section('## What')}\n${section('## Why it matters')}\n${section('## Constraints', '- z')}`;

test('a conforming note passes, with and without the omittable heading, as a debt, with a fenced heading, and as CRLF', () => {
  assert.deepEqual(noteProblems(conforming, FUTURE), []);
  assert.deepEqual(noteProblems(`# Title\n\n${section('## What')}\n${section('## Why it matters')}`, FUTURE), []);
  assert.deepEqual(noteProblems(`# Debt\n\n${DEBT.map((d) => section(d.text)).join('\n')}`, DEBT), []);
  assert.deepEqual(noteProblems(`# Title\n\n${section('## What', '```md\n## not a heading\n```')}\n${section('## Why it matters')}`, FUTURE), []);
  assert.deepEqual(noteProblems(conforming.replace(/\n/g, '\r\n'), FUTURE), []);
});

test('each failure class is reported on its own', () => {
  const cases = {
    'no H1 on line one': [`Title\n\n${section('## What')}\n${section('## Why it matters')}`, /line 1 is not an H1/],
    'a second H1': [`${conforming}\n# Another\n`, /second H1/],
    'over the cap': [`${conforming}\n${'x\n'.repeat(MAX_LINES)}`, new RegExp(`the cap is ${MAX_LINES}`)],
    'an extra heading': [`${conforming}\n${section('## Evidence')}`, /outside the template: ## Evidence/],
    'wrong order': [`# Title\n\n${section('## Why it matters')}\n${section('## What')}`, /out of template order/],
    'a missing required heading': [`# Title\n\n${section('## What')}\n${section('## Constraints')}`, /missing required heading: ## Why it matters/],
    'prose before the first section': [`# Title\n\nintro\n\n${section('## What')}\n${section('## Why it matters')}`, /prose before the first section/],
    'an H3': [`# Title\n\n${section('## What', '### sub\n\nx')}\n${section('## Why it matters')}`, /deeper than H2/],
  };
  for (const [name, [text, expected]] of Object.entries(cases)) {
    const problems = noteProblems(text, FUTURE);
    assert.equal(problems.length, 1, `${name}: expected exactly one violation, got ${JSON.stringify(problems)}`);
    assert.match(problems[0], expected, name);
  }
  const debt = noteProblems(`# Debt\n\n${DEBT.slice(0, 3).map((d) => section(d.text)).join('\n')}`, DEBT);
  assert.deepEqual(debt.map((p) => p.split(';')[0]), ['missing required heading: ## Remediation sketch']);
});
