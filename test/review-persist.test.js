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
