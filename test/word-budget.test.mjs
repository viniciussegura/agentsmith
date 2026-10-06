import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');

// The caps' one home (docs/design-decisions/lean-split.md). An agent pays for the core on
// every turn, so a rule over its cap is cut or split; no cap is raised to admit one.
export const CORE_MODULE_CAP = 250;
export const BUNDLE_MODULE_CAP = 500;
export const TOOLING_RULE_CAP = 120;
export const GENERATED_CORE_CAP = 8000;

// The four rules that point at the review-board protocol instead of carrying it.
export const TOOLING_RULES = [
  'instructions/core/ai/ai-review-engine.md',
  'instructions/core/ai/ai-review-board.md',
  'instructions/process/ai-spec-review.md',
  'instructions/authoring/ai-instruction-review.md',
];

const REMEDY = 'cut rationale, or move an obligation to the document that is its home';

// Whitespace-separated tokens, fenced code included: an agent reads that too. Same
// arithmetic as `wc -w`.
export const wordCount = (text) => String(text).split(/\s+/).filter(Boolean).length;

const isCore = (rel) => rel.startsWith('instructions/core/') || rel === 'instructions/main.md';

// The cap a module takes from its section: the core and the preamble 250, any bundle 500.
export const capFor = (rel) => (isCore(rel) ? CORE_MODULE_CAP : BUNDLE_MODULE_CAP);

export function moduleProblems(rel, text, cap = capFor(rel)) {
  const words = wordCount(text);
  return words > cap ? [`${rel}: ${words} words, the cap is ${cap}: ${REMEDY}`] : [];
}

export function coreProblems(text, cap = GENERATED_CORE_CAP) {
  const words = wordCount(text);
  return words > cap ? [`the generated core is ${words} words, the cap is ${cap}: ${REMEDY}`] : [];
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith('.md') && e.name !== '_intro.md' ? [p] : [];
  });
}

const modules = () => walk(join(root, 'instructions')).map((p) => relative(root, p).split('\\').join('/'));
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('every rule module is at or under its section cap', () => {
  const files = modules();
  assert.ok(files.length > 0, 'the walk found no modules');
  const problems = files.flatMap((rel) => moduleProblems(rel, read(rel)));
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('the four tooling rules exist and are at or under their own cap', () => {
  for (const rel of TOOLING_RULES) {
    assert.ok(existsSync(join(root, rel)), `${rel} is missing; the list names a rule that no longer exists`);
    assert.deepEqual(moduleProblems(rel, read(rel), TOOLING_RULE_CAP), []);
  }
});

test('the generated core is at or under its cap', () => {
  const r = spawnSync(process.execPath, ['bin/cli.js', '--stdout'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(coreProblems(r.stdout), []);
});

test('a module at its cap passes and one word over fails, naming the file, count, cap, and remedy', () => {
  const at = Array(CORE_MODULE_CAP).fill('w').join(' ');
  assert.deepEqual(moduleProblems('instructions/core/x/x.md', at), []);
  const over = moduleProblems('instructions/core/x/x.md', `${at} w`);
  assert.equal(over.length, 1);
  assert.match(over[0], /instructions\/core\/x\/x\.md: 251 words, the cap is 250: cut rationale/);
  assert.deepEqual(moduleProblems('instructions/backend/x.md', Array(BUNDLE_MODULE_CAP).fill('w').join(' ')), []);
  assert.equal(moduleProblems('instructions/backend/x.md', Array(BUNDLE_MODULE_CAP + 1).fill('w').join(' ')).length, 1);
  assert.equal(capFor('instructions/main.md'), CORE_MODULE_CAP, 'the preamble takes the core cap');
});

test('the core check fails on a text over its cap', () => {
  assert.deepEqual(coreProblems('a b c', 3), []);
  assert.match(coreProblems('a b c d', 3)[0], /4 words, the cap is 3/);
});

test('the counter matches wc -w arithmetic on edge cases and a real module', () => {
  assert.equal(wordCount(''), 0);
  assert.equal(wordCount('a\r\nb\r\n'), 2);
  assert.equal(wordCount('a    b\t\tc\n\n\nd'), 4);
  const rel = 'instructions/core/swe/swe-reuse.md';
  const wc = spawnSync('wc', ['-w'], { input: read(rel), encoding: 'utf8' });
  if (wc.status === 0) assert.equal(wordCount(read(rel)), Number(wc.stdout.trim().split(/\s+/)[0]));
});
