import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { persistApply, persistSummary } from '../tools/claude/skills/code-review-board/persist.mjs';

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

test('summary projects carried-forward open issues and accepted new findings', () => {
  const { store, scratchDir, roundId } = scaffold('r6');
  // A carried-forward open issue already in the store.
  writeJson(join(store, 'issues', 'swe', 'r1--swe-1-carried.json'), {
    ...newFinding('r1#swe-1', { title: 'Carried' }),
  });
  // A new finding this round, accepted.
  writeJson(join(scratchDir, 'findings', 'swe.json'), { role: 'swe', new: [newFinding('r6#swe-1', { title: 'Fresh' })], reconcile: [] });
  writeJson(join(scratchDir, 'verdicts', 'r6--swe-1.json'), { id: 'r6#swe-1', verdict: 'accept', rationale: 'ok' });

  const out = persistSummary({ store, scratchDir, roundId });

  const onDisk = JSON.parse(readFileSync(join(scratchDir, 'pm-input.json'), 'utf8'));
  assert.deepEqual(onDisk, out);
  assert.equal(out.carried.length, 1);
  assert.equal(out.carried[0].id, 'r1#swe-1');
  assert.equal(out.new.length, 1);
  assert.equal(out.new[0].id, 'r6#swe-1');
  // Summaries are lean: no description/locations.
  assert.equal(out.new[0].description, undefined);
});

test('epic child that the PM rejected is dropped, store stays lint-clean', () => {
  const { store, scratchDir, roundId } = scaffold('r7');
  writeJson(join(scratchDir, 'findings', 'swe.json'), {
    role: 'swe',
    new: [newFinding('r7#swe-1'), newFinding('r7#swe-2', { title: 'Rejected child' })],
    reconcile: [],
  });
  for (const id of ['r7--swe-1', 'r7--swe-2']) {
    writeJson(join(scratchDir, 'verdicts', `${id}.json`), { id: id.replace('--', '#'), verdict: 'accept', rationale: 'ok' });
  }
  // PM rejects swe-2 but ALSO lists it as an epic child -> must not dangle.
  writeJson(join(scratchDir, 'pm-directive.json'), {
    epics: [{ id: 'r7#epic-1', title: 'Theme', priority: 'high', priorityRationale: 'rollup', children: ['r7#swe-1', 'r7#swe-2'] }],
    rejections: [{ id: 'r7#swe-2', reason: 'not worth tracking' }],
  });

  const res = persistApply({ store, scratchDir, roundId });
  assert.equal(res.errors.length, 0, res.errors.join('\n'));

  // swe-2 was not written (rejected); the epic links only swe-1.
  assert.equal(existsSync(join(store, 'issues', 'swe')) && readdirSync(join(store, 'issues', 'swe')).some((f) => f.startsWith('r7--swe-2')), false);
  const epicFile = readdirSync(join(store, 'epics')).find((f) => f.startsWith('r7--epic-1'));
  const epic = JSON.parse(readFileSync(join(store, 'epics', epicFile), 'utf8'));
  assert.deepEqual(epic.relatedIssues.map((r) => r.issueId), ['r7#swe-1']);
});

// --- round-record validation (pays off the 2026-07-30 debt) -----------------
// persistApply derived `rounds/<record.id>.json` from an unvalidated field, so a
// record missing `id` wrote `rounds/undefined.json` and exited 0. The defect was
// caught only by lint, after the whole round had run -- and two malformed rounds
// overwrote each other at that one filename.

// Overwrite the scaffolded round.json with `over`, dropping any key set to undefined.
function withRound(scratchDir, over) {
  const path = join(scratchDir, 'round.json');
  const round = JSON.parse(readFileSync(path, 'utf8'));
  const next = { ...round, ...over };
  for (const [k, v] of Object.entries(over)) if (v === undefined) delete next[k];
  writeFileSync(path, JSON.stringify(next, null, 2));
}

test('apply rejects a round record missing id, before writing anything', () => {
  const { store, scratchDir, roundId } = scaffold();
  withRound(scratchDir, { id: undefined });
  writeJson(join(scratchDir, 'findings', 'swe.json'), { role: 'swe', new: [newFinding('r1#swe-1')], reconcile: [] });
  writeJson(join(scratchDir, 'verdicts', 'r1--swe-1.json'), { id: 'r1#swe-1', verdict: 'accept', rationale: 'real' });

  assert.throws(() => persistApply({ store, scratchDir, roundId }), /round record/i);
  assert.equal(existsSync(join(store, 'rounds', 'undefined.json')), false, 'never names a file from undefined');
  assert.equal(existsSync(join(store, 'rounds')), false, 'fails closed: no round file at all');
  assert.equal(existsSync(join(store, 'issues', 'swe')), false, 'fails closed: no issue written either');
});

test('apply names every missing required field, not just the first', () => {
  const { store, scratchDir, roundId } = scaffold();
  withRound(scratchDir, { id: undefined, baselineCommit: undefined, roles: undefined });
  try {
    persistApply({ store, scratchDir, roundId });
    assert.fail('expected a throw');
  } catch (e) {
    for (const f of ['id', 'baselineCommit', 'roles']) {
      assert.match(e.message, new RegExp(f), `names the missing field ${f}`);
    }
  }
});

test('apply reports an unknown round field, catching a drifted field name', () => {
  const { store, scratchDir, roundId } = scaffold();
  // The exact operator error from the debt: ReviewRoundInfo's `roles`, hand-written
  // as `selectedRoles`. Reported as BOTH a missing required field and an unknown one.
  withRound(scratchDir, { roles: undefined, selectedRoles: ['swe'] });
  try {
    persistApply({ store, scratchDir, roundId });
    assert.fail('expected a throw');
  } catch (e) {
    assert.match(e.message, /selectedRoles/, 'names the unknown field');
    assert.match(e.message, /roles/, 'and the required one it was meant to be');
  }
});

test('apply accepts a valid record carrying the optional previousRound', () => {
  const { store, scratchDir, roundId } = scaffold();
  withRound(scratchDir, { previousRound: 'r0' });
  const res = persistApply({ store, scratchDir, roundId });
  assert.equal(res.errors.length, 0, res.errors.join('\n'));
  assert.ok(existsSync(join(store, 'rounds', 'r1.json')));
});

// --- apply reports what it wrote -------------------------------------------
// A run that wrote nothing was indistinguishable from a successful one: apply
// printed only an error count, so an empty store had to be inferred by inspecting
// the store rather than read off the transcript.

test('apply returns counts of what it wrote, zero included', () => {
  const { store, scratchDir, roundId } = scaffold();
  const res = persistApply({ store, scratchDir, roundId });
  assert.deepEqual(res.counts, { issues: 0, epics: 0, rounds: 1 }, 'an empty round still reports its zeros');
});

test('apply counts issues and epics separately from the round record', () => {
  const { store, scratchDir, roundId } = scaffold();
  writeJson(join(scratchDir, 'findings', 'swe.json'), {
    role: 'swe', new: [newFinding('r1#swe-1'), newFinding('r1#swe-2', { title: 'Second' })], reconcile: [],
  });
  for (const id of ['r1--swe-1', 'r1--swe-2']) {
    writeJson(join(scratchDir, 'verdicts', `${id}.json`), { id: id.replace('--', '#'), verdict: 'accept', rationale: 'ok' });
  }
  writeJson(join(scratchDir, 'pm-directive.json'), {
    epics: [{ id: 'r1#epic-1', title: 'Theme', priority: 'high', priorityRationale: 'rollup', children: ['r1#swe-1'] }],
  });

  const res = persistApply({ store, scratchDir, roundId });
  assert.equal(res.errors.length, 0, res.errors.join('\n'));
  assert.deepEqual(res.counts, { issues: 2, epics: 1, rounds: 1 });
});
