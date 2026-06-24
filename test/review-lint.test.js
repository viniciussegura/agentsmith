import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseId, idToSafe, lintStore } from '../tools/claude/skills/review-board/lint.mjs';

const repoRoot = resolve(fileURLToPath(import.meta.url), '../..');

// Build a throwaway reviews/ store from a { relPath: content } map.
function mkStore(files) {
  const root = mkdtempSync(join(tmpdir(), 'reviews-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

const ISSUE = JSON.stringify({
  id: 'r1#swe-1', kind: 'issue', title: 'Something is off',
  description: 'multi\nline', priority: 'medium', priorityRationale: 'maintainability',
  status: 'open', lastConfirmedCommit: 'abc1234',
  locations: [{ filename: 'src/foo.js', lines: [10, 20], snippet: 'x = 1' }],
  relatedIssues: [{ issueId: 'r1#epic-1', description: 'child-of' }],
}, null, 2);

const EPIC = JSON.stringify({
  id: 'r1#epic-1', kind: 'epic', title: 'A theme of work', description: 'grouping',
  priority: 'high', priorityRationale: 'rollup', status: 'open', lastConfirmedCommit: 'abc1234',
  relatedIssues: [{ issueId: 'r1#swe-1', description: 'parent-of' }],
}, null, 2);

const ROUND = JSON.stringify({
  id: 'r1', mode: 'diff', targetRef: 'feature-branch',
  commit: 'deadbeef', baselineCommit: 'cafe1234', roles: ['swe'],
}, null, 2);

function cleanStore(extra = {}) {
  return mkStore({
    'issues/swe/r1--swe-1-something.json': ISSUE,
    'epics/r1--epic-1-theme.json': EPIC,
    'rounds/r1.json': ROUND,
    ...extra,
  });
}

test('parseId splits a compositional id and rejects malformed ones', () => {
  assert.deepEqual(parseId('r1#swe-3'), { roundId: 'r1', role: 'swe', n: 3 });
  assert.deepEqual(parseId('2026-06-09-feat#epic-2'), {
    roundId: '2026-06-09-feat',
    role: 'epic',
    n: 2,
  });
  assert.equal(parseId('nohash'), null);
  assert.equal(parseId('r1#swe'), null);
});

test('idToSafe replaces # with --', () => {
  assert.equal(idToSafe('r1#swe-1'), 'r1--swe-1');
  assert.equal(idToSafe('2026-06-09-feat#epic-2'), '2026-06-09-feat--epic-2');
});

test('a clean store lints with no errors or warnings', () => {
  const root = cleanStore();
  try {
    const { errors, warnings } = lintStore({ root });
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a missing store is clean (nothing to validate)', () => {
  const { errors, warnings } = lintStore({ root: join(tmpdir(), 'no-such-reviews-dir') });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('an id whose role segment disagrees with its directory is an error', () => {
  const root = mkStore({
    'issues/qa/r1--swe-1-x.json': ISSUE, // swe id under qa/
    'rounds/r1.json': ROUND,
  });
  try {
    const { errors } = lintStore({ root });
    assert.ok(
      errors.some((e) => /id role `swe` != role directory `qa`/.test(e)),
      errors.join('\n'),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a closing status is coupled to placement, closingComments, and closedInRound', () => {
  const broken = JSON.stringify({
    id: 'r1#swe-1', kind: 'issue', title: 'Broken closer', description: 'x',
    priority: 'low', priorityRationale: 'x',
    status: 'fixed',
    lastConfirmedCommit: 'abc1234',
    // no closingComments, no closedInRound
  }, null, 2);
  const root = mkStore({
    // status fixed but still in the open dir, no closingComments, no closedInRound
    'issues/swe/r1--swe-1-x.json': broken,
    'rounds/r1.json': ROUND,
  });
  try {
    const { errors } = lintStore({ root });
    assert.ok(errors.some((e) => /requires placement `closed\/`/.test(e)), 'placement');
    assert.ok(errors.some((e) => /requires non-empty `closingComments`/.test(e)), 'closingComments');
    assert.ok(errors.some((e) => /requires `closedInRound`/.test(e)), 'closedInRound');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a promoted issue must live in promoted/ and carry promotedTo', () => {
  const promoted = JSON.stringify({
    id: 'r1#swe-1', kind: 'issue', title: 'Escalated', description: 'x',
    priority: 'high', priorityRationale: 'x',
    status: 'promoted',
    lastConfirmedCommit: 'abc1234',
    // no promotedTo
  }, null, 2);
  const root = mkStore({
    'config.yaml': 'tracker: github\n', // a tracker is configured -> promotedTo required
    'issues/swe/r1--swe-1-x.json': promoted, // not under promoted/, no promotedTo
    'rounds/r1.json': ROUND,
  });
  try {
    const { errors } = lintStore({ root });
    assert.ok(errors.some((e) => /requires placement `promoted\/`/.test(e)), 'placement');
    assert.ok(errors.some((e) => /requires `promotedTo`/.test(e)), 'promotedTo');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('no tracker configured: a promoted issue without promotedTo is allowed', () => {
  const promoted = JSON.stringify({
    id: 'r1#swe-1', kind: 'issue', title: 'Escalated', description: 'x',
    priority: 'high', priorityRationale: 'x',
    status: 'promoted',
    lastConfirmedCommit: 'abc1234',
  }, null, 2);
  const root = mkStore({
    // no config.yaml -> no tracker -> promotedTo not required
    'issues/swe/promoted/r1--swe-1-x.json': promoted, // correct placement
    'rounds/r1.json': ROUND,
  });
  try {
    const { errors } = lintStore({ root });
    assert.ok(!errors.some((e) => /requires `promotedTo`/.test(e)), 'promotedTo not required without a tracker');
    assert.deepEqual(errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a dangling relatedIssues reference is an error', () => {
  // Replace the issueId in the ISSUE JSON to point to an unknown id
  const parsed = JSON.parse(ISSUE);
  parsed.relatedIssues[0].issueId = 'r1#epic-999';
  const dangling = JSON.stringify(parsed, null, 2);
  const root = mkStore({
    'issues/swe/r1--swe-1-something.json': dangling,
    'rounds/r1.json': ROUND,
  });
  try {
    const { errors } = lintStore({ root });
    assert.ok(
      errors.some((e) => /relatedIssues references unknown id `r1#epic-999`/.test(e)),
      errors.join('\n'),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a duplicate id across two files is an error', () => {
  const root = cleanStore({
    'issues/swe/r1--swe-1-dup.json': ISSUE, // same id as the canonical fixture
  });
  try {
    const { errors } = lintStore({ root });
    assert.ok(errors.some((e) => /duplicate id `r1#swe-1`/.test(e)), errors.join('\n'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a round missing baselineCommit is an error', () => {
  const roundMissingBaseline = JSON.parse(ROUND);
  delete roundMissingBaseline.baselineCommit;
  const root = mkStore({
    'issues/swe/r1--swe-1-something.json': ISSUE,
    'epics/r1--epic-1-theme.json': EPIC,
    'rounds/r1.json': JSON.stringify(roundMissingBaseline, null, 2),
  });
  try {
    const { errors } = lintStore({ root });
    assert.ok(errors.some((e) => /`baselineCommit` is missing/.test(e)), errors.join('\n'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an epic id under issues/ (kind mismatch) is an error', () => {
  const root = mkStore({
    'issues/swe/r1--epic-1-x.json': EPIC, // epic kind under issues/
    'rounds/r1.json': ROUND,
  });
  try {
    const { errors } = lintStore({ root });
    assert.ok(errors.some((e) => /expected kind issue/.test(e)), errors.join('\n'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('invalid JSON in a store file is an error', () => {
  const root = mkStore({
    'issues/swe/r1--swe-1-bad.json': '{ this is not valid json',
    'rounds/r1.json': ROUND,
  });
  try {
    const { errors } = lintStore({ root });
    assert.ok(errors.some((e) => /invalid JSON/.test(e)), errors.join('\n'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// CI gate: if this repo ever grows a real reviews/ store, it must lint clean.
test('CI gate: the repo reviews/ store (if present) lints clean', () => {
  const root = join(repoRoot, 'reviews');
  if (!existsSync(root)) return; // design-only today; no-op until a store lands
  const { errors } = lintStore({ root });
  assert.deepEqual(errors, [], errors.join('\n'));
});
