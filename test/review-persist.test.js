import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { persistApply, persistSummary } from '../tools/claude/skills/review-board/persist.mjs';

// Build a round scratch dir + empty store; return { store, scratchDir, roundId }.
function scaffold(roundId = 'r1') {
  const base = mkdtempSync(join(tmpdir(), 'rb-'));
  const store = join(base, '.agentsmith', 'review-board');
  const scratchDir = join(base, '.agentsmith', 'tmp', 'review-board', roundId);
  mkdirSync(store, { recursive: true });
  mkdirSync(join(scratchDir, 'findings'), { recursive: true });
  mkdirSync(join(scratchDir, 'verdicts'), { recursive: true });
  const round = {
    id: roundId, mode: 'diff', targetRef: 'feature-branch',
    commit: 'deadbeef', baselineCommit: 'cafe1234', roles: ['swe'],
  };
  writeFileSync(join(scratchDir, 'round.json'), JSON.stringify(round, null, 2));
  return { store, scratchDir, roundId };
}

function writeJson(p, o) {
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, JSON.stringify(o, null, 2));
}

function newFinding(id, over = {}) {
  return {
    id, kind: 'issue', title: 'Off by one', description: 'detail',
    priority: 'medium', priorityRationale: 'correctness', status: 'open',
    lastConfirmedCommit: 'cafe1234',
    locations: [{ filename: 'src/a.js', lines: [1, 1], snippet: 'x' }],
    ...over,
  };
}

test('apply writes only accepted new issues, and lints clean', () => {
  const { store, scratchDir, roundId } = scaffold();
  writeJson(join(scratchDir, 'findings', 'swe.json'), {
    role: 'swe',
    new: [newFinding('r1#swe-1'), newFinding('r1#swe-2', { title: 'Rejected one' })],
    reconcile: [],
  });
  writeJson(join(scratchDir, 'verdicts', 'r1--swe-1.json'), { id: 'r1#swe-1', verdict: 'accept', rationale: 'real' });
  writeJson(join(scratchDir, 'verdicts', 'r1--swe-2.json'), { id: 'r1#swe-2', verdict: 'reject', rationale: 'noise' });

  const res = persistApply({ store, scratchDir, roundId });

  assert.equal(res.errors.length, 0, res.errors.join('\n'));
  const files = readdirSync(join(store, 'issues', 'swe'));
  assert.equal(files.length, 1);
  assert.match(files[0], /^r1--swe-1-/);
  const written = JSON.parse(readFileSync(join(store, 'issues', 'swe', files[0]), 'utf8'));
  assert.equal(written.id, 'r1#swe-1');
  assert.equal(written.status, 'open');
  assert.ok(existsSync(join(store, 'rounds', 'r1.json')));
});

test('reconcile closes, reopens, and refreshes still-open issues', () => {
  const { store, scratchDir, roundId } = scaffold('r2');
  // Seed an existing open issue (from a prior round r1) and a recently-closed one.
  writeJson(join(store, 'issues', 'swe', 'r1--swe-1-old.json'), {
    ...newFinding('r1#swe-1', { title: 'Old open' }), lastConfirmedCommit: 'aaa',
  });
  writeJson(join(store, 'issues', 'swe', 'closed', 'r1--swe-9-gone.json'), {
    ...newFinding('r1#swe-9', { title: 'Was fixed' }),
    status: 'fixed', closingComments: 'done', closedInRound: 'r1',
  });
  writeJson(join(scratchDir, 'findings', 'swe.json'), {
    role: 'swe',
    new: [],
    reconcile: [
      { id: 'r1#swe-1', transition: 'fixed', closingComments: 'patched in PR #4' },
      { id: 'r1#swe-9', transition: 'reopen' },
    ],
  });

  const res = persistApply({ store, scratchDir, roundId });
  assert.equal(res.errors.length, 0, res.errors.join('\n'));

  // r1#swe-1 now closed.
  assert.equal(readdirSync(join(store, 'issues', 'swe')).filter((f) => f.startsWith('r1--swe-1')).length, 0);
  const closed = readdirSync(join(store, 'issues', 'swe', 'closed'));
  const fixed = JSON.parse(readFileSync(join(store, 'issues', 'swe', 'closed', closed.find((f) => f.startsWith('r1--swe-1'))), 'utf8'));
  assert.equal(fixed.status, 'fixed');
  assert.equal(fixed.closedInRound, 'r2');
  assert.match(fixed.closingComments, /PR #4/);

  // r1#swe-9 reopened to open placement.
  const reopened = readdirSync(join(store, 'issues', 'swe')).find((f) => f.startsWith('r1--swe-9'));
  assert.ok(reopened, 'reopened file should be directly under role dir');
  const ro = JSON.parse(readFileSync(join(store, 'issues', 'swe', reopened), 'utf8'));
  assert.equal(ro.status, 'open');
  assert.equal(ro.closingComments, undefined);
  assert.equal(ro.closedInRound, undefined);
});

test('reconcile still-open refreshes locations and baseline', () => {
  const { store, scratchDir, roundId } = scaffold('r3');
  writeJson(join(store, 'issues', 'swe', 'r1--swe-1-old.json'), {
    ...newFinding('r1#swe-1'), lastConfirmedCommit: 'aaa',
  });
  writeJson(join(scratchDir, 'findings', 'swe.json'), {
    role: 'swe', new: [],
    reconcile: [{ id: 'r1#swe-1', transition: 'still-open', locations: [{ filename: 'src/a.js', lines: [5, 9], snippet: 'y' }] }],
  });
  const res = persistApply({ store, scratchDir, roundId });
  assert.equal(res.errors.length, 0, res.errors.join('\n'));
  const f = readdirSync(join(store, 'issues', 'swe')).find((x) => x.startsWith('r1--swe-1'));
  const o = JSON.parse(readFileSync(join(store, 'issues', 'swe', f), 'utf8'));
  assert.equal(o.lastConfirmedCommit, 'cafe1234');
  assert.deepEqual(o.locations[0].lines, [5, 9]);
});

test('pm directive writes epics, applies overrides and duplicates', () => {
  const { store, scratchDir, roundId } = scaffold('r4');
  writeJson(join(scratchDir, 'findings', 'swe.json'), {
    role: 'swe',
    new: [newFinding('r4#swe-1'), newFinding('r4#swe-2', { title: 'Dup of one' })],
    reconcile: [],
  });
  for (const id of ['r4--swe-1', 'r4--swe-2']) {
    writeJson(join(scratchDir, 'verdicts', `${id}.json`), { id: id.replace('--', '#'), verdict: 'accept', rationale: 'ok' });
  }
  writeJson(join(scratchDir, 'pm-directive.json'), {
    epics: [{ id: 'r4#epic-1', title: 'A theme', priority: 'high', priorityRationale: 'rollup', children: ['r4#swe-1'] }],
    priorityOverrides: [{ id: 'r4#swe-1', priority: 'high', rationale: 'user-facing' }],
    duplicates: [{ id: 'r4#swe-2', canonical: 'r4#swe-1', comment: 'same root cause' }],
  });

  const res = persistApply({ store, scratchDir, roundId });
  assert.equal(res.errors.length, 0, res.errors.join('\n'));

  const epicFile = readdirSync(join(store, 'epics')).find((f) => f.startsWith('r4--epic-1'));
  const epic = JSON.parse(readFileSync(join(store, 'epics', epicFile), 'utf8'));
  assert.equal(epic.kind, 'epic');
  assert.equal(epic.relatedIssues[0].issueId, 'r4#swe-1');

  const one = JSON.parse(readFileSync(join(store, 'issues', 'swe', readdirSync(join(store, 'issues', 'swe')).find((f) => f.startsWith('r4--swe-1'))), 'utf8'));
  assert.equal(one.priority, 'high');

  const dup = JSON.parse(readFileSync(join(store, 'issues', 'swe', 'closed', readdirSync(join(store, 'issues', 'swe', 'closed')).find((f) => f.startsWith('r4--swe-2'))), 'utf8'));
  assert.equal(dup.status, 'duplicated');
  assert.equal(dup.relatedIssues.at(-1).issueId, 'r4#swe-1');
});

test('malformed findings JSON fails closed before writing the store', () => {
  const { store, scratchDir, roundId } = scaffold('r5');
  writeFileSync(join(scratchDir, 'findings', 'swe.json'), '{ this is not json');
  assert.throws(() => persistApply({ store, scratchDir, roundId }), /JSON/i);
  // No partial store written.
  assert.equal(existsSync(join(store, 'rounds', 'r5.json')), false);
  assert.equal(existsSync(join(store, 'issues')), false);
});
