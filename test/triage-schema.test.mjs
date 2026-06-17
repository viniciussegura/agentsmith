import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEntry,
  validateFile,
  validateCrossRefs,
  canonicalJSON,
  versionToken,
} from '../devtools/triage-ui/schema.mjs';

const baseStrengthen = () => ({
  tag: 'swe-errors',
  kind: 'strengthen',
  role: 'swe',
  targetFile: 'instructions/core/swe.md',
  status: { state: 'ready' },
  gap: 'context undefined',
  current: '## #swe-errors old',
  draft: '## #swe-errors new',
  decision: { verdict: 'park' },
  applyLog: [],
});

test('valid strengthen entry passes', () => {
  assert.deepEqual(validateEntry(baseStrengthen()), []);
});

test('valid entry per kind', () => {
  const newRule = {
    tag: 't', kind: 'new-rule', role: 'swe', targetFile: 'f.md',
    status: { state: 'ready' }, gap: 'g', draft: 'd',
    decision: { verdict: 'park' }, applyLog: [],
  };
  const rehome = {
    tag: 't', kind: 'rehome', role: 'swe', targetFile: 'a.md', proposedFile: 'b.md',
    status: { state: 'ready' }, gap: 'g', decision: { verdict: 'park' }, applyLog: [],
  };
  const reowner = {
    tag: 't', kind: 'reowner', role: 'swe', targetFile: 'a.md', proposedOwner: 'db',
    status: { state: 'ready' }, gap: 'g', decision: { verdict: 'park' }, applyLog: [],
  };
  assert.deepEqual(validateEntry(newRule), []);
  assert.deepEqual(validateEntry(rehome), []);
  assert.deepEqual(validateEntry(reowner), []);
});

test('missing required base fields are reported', () => {
  const e = baseStrengthen();
  delete e.role;
  delete e.targetFile;
  const p = validateEntry(e);
  assert.ok(p.some((m) => m.includes('"role"')));
  assert.ok(p.some((m) => m.includes('"targetFile"')));
});

test('per-kind required fields enforced', () => {
  const newRuleNoDraft = { ...baseStrengthen(), kind: 'new-rule', current: undefined, draft: undefined };
  assert.ok(validateEntry(newRuleNoDraft).some((m) => m.includes('new-rule requires "draft"')));

  const strengthenNoCurrent = { ...baseStrengthen(), current: undefined };
  assert.ok(validateEntry(strengthenNoCurrent).some((m) => m.includes('strengthen requires "current"')));

  const newRuleWithCurrent = { ...baseStrengthen(), kind: 'new-rule', current: 'x' };
  assert.ok(validateEntry(newRuleWithCurrent).some((m) => m.includes('must not carry "current"')));
});

test('status union: blocked/conditional require blockedOn; ready forbids it', () => {
  const blockedNoDep = { ...baseStrengthen(), status: { state: 'blocked' } };
  assert.ok(validateEntry(blockedNoDep).some((m) => m.includes('blockedOn" required')));

  const readyWithDep = { ...baseStrengthen(), status: { state: 'ready', blockedOn: '#x' } };
  assert.ok(validateEntry(readyWithDep).some((m) => m.includes('not allowed when state is ready')));

  const ok = { ...baseStrengthen(), status: { state: 'conditional', blockedOn: 'has a db' } };
  assert.deepEqual(validateEntry(ok), []);

  const badState = { ...baseStrengthen(), status: { state: 'nope' } };
  assert.ok(validateEntry(badState).some((m) => m.includes('status.state')));
});

test('decision union: details/foldTarget required where applicable', () => {
  const rejectNoDetails = { ...baseStrengthen(), decision: { verdict: 'reject' } };
  assert.ok(validateEntry(rejectNoDetails).some((m) => m.includes('details" required for verdict reject')));

  const foldNoTarget = { ...baseStrengthen(), decision: { verdict: 'fold', details: 'why' } };
  assert.ok(validateEntry(foldNoTarget).some((m) => m.includes('foldTarget" required')));

  const foldOk = { ...baseStrengthen(), decision: { verdict: 'fold', foldTarget: '#swe-done', details: 'why' } };
  assert.deepEqual(validateEntry(foldOk), []);

  const adoptWithFoldTarget = { ...baseStrengthen(), decision: { verdict: 'adopt', foldTarget: '#x' } };
  assert.ok(validateEntry(adoptWithFoldTarget).some((m) => m.includes('only allowed for verdict fold')));

  const badVerdict = { ...baseStrengthen(), decision: { verdict: 'maybe' } };
  assert.ok(validateEntry(badVerdict).some((m) => m.includes('decision.verdict')));
});

test('validateFile: round required, duplicate tags reported', () => {
  assert.ok(validateFile({ entries: [] }).some((m) => m.includes('"round"')));

  const dup = { round: '2026-06-17', entries: [baseStrengthen(), baseStrengthen()] };
  assert.ok(validateFile(dup).some((m) => m.includes('duplicate tag')));

  const good = { round: '2026-06-17', entries: [baseStrengthen()] };
  assert.deepEqual(validateFile(good), []);
});

test('validateCrossRefs: fold target must be live; proposedOwner resolvable', () => {
  const file = {
    round: 'r',
    entries: [
      { ...baseStrengthen(), tag: 'a', decision: { verdict: 'fold', foldTarget: '#ghost', details: 'x' } },
      { tag: 'b', kind: 'reowner', role: 'swe', targetFile: 'f.md', proposedOwner: 'nobody',
        status: { state: 'ready' }, gap: 'g', decision: { verdict: 'park' }, applyLog: [] },
    ],
  };
  const p = validateCrossRefs(file, { liveTags: ['#swe-done'], resolvableOwners: ['db'] });
  assert.ok(p.some((m) => m.includes('fold target "#ghost" is not a live')));
  assert.ok(p.some((m) => m.includes('proposedOwner "nobody"')));

  const ok = validateCrossRefs(
    { round: 'r', entries: [{ ...baseStrengthen(), decision: { verdict: 'fold', foldTarget: '#swe-done', details: 'x' } }] },
    { liveTags: ['#swe-done'], resolvableOwners: [] },
  );
  assert.deepEqual(ok, []);
});

test('canonicalJSON: sorted keys, 2-space, trailing newline, stable', () => {
  const a = canonicalJSON({ b: 1, a: { d: 2, c: 3 } });
  assert.equal(a, '{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n');
  // key order in source does not matter
  assert.equal(canonicalJSON({ a: { c: 3, d: 2 }, b: 1 }), a);
});

test('versionToken: stable under reformat, changes on content edit', () => {
  const obj = { round: 'r', entries: [baseStrengthen()] };
  const pretty = JSON.stringify(obj, null, 2);
  const compact = JSON.stringify(obj);
  // same content, different byte layout -> same token
  assert.equal(versionToken(pretty), versionToken(compact));
  // a same-length content change -> different token
  const edited = structuredClone(obj);
  edited.entries[0].gap = 'context REDEFINED!!'; // different content
  assert.notEqual(versionToken(JSON.stringify(obj)), versionToken(JSON.stringify(edited)));
});
