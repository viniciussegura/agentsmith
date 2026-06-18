import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEntry,
  validateFile,
  validateCrossRefs,
  canonicalJSON,
  versionToken,
  migrateWorksheet,
  validateCandidate, validateScorecard, PRIORITIES, CANDIDATE_VERDICTS, SCORECARD_VERDICTS,
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

  // v2: strengthen no longer requires "current" — no assertion for that

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

test('v2: details forbidden on adopt/park', () => {
  const base = { tag: 't', role: 'swe', targetFile: 'instructions/core/swe/t.md',
    status: { state: 'ready' }, gap: 'g', kind: 'new-rule', draft: '# #t', applyLog: [] };
  assert.notDeepEqual(validateEntry({ ...base, decision: { verdict: 'adopt', details: 'x' } }), []);
  assert.deepEqual(validateEntry({ ...base, decision: { verdict: 'adopt' } }), []);
});

test('v2: strengthen no longer requires current', () => {
  const e = { tag: 't', role: 'swe', targetFile: 'f', status: { state: 'ready' }, gap: 'g',
    kind: 'strengthen', draft: '# #t', decision: { verdict: 'park' }, applyLog: [] };
  assert.deepEqual(validateEntry(e), []);
});

test('v2: lastRoundReply must be a string when present', () => {
  const e = { tag: 't', role: 'swe', targetFile: 'f', status: { state: 'ready' }, gap: 'g',
    kind: 'new-rule', draft: '# #t', decision: { verdict: 'refine', details: 'q' }, applyLog: [], lastRoundReply: 5 };
  assert.notDeepEqual(validateEntry(e), []);
  assert.deepEqual(validateEntry({ ...e, lastRoundReply: '' }), []);
});

test('migrateWorksheet strips current + adopt/park details, idempotent', () => {
  const wrk = { round: 'r', entries: [
    { tag: 'a', role: 'swe', targetFile: 'f', status: { state: 'ready' }, gap: 'g', kind: 'strengthen',
      current: '# #a old', draft: '# #a new', decision: { verdict: 'adopt', details: 'note' }, applyLog: [] },
  ] };
  const m = migrateWorksheet(wrk);
  assert.equal(m.entries[0].current, undefined);
  assert.equal(m.entries[0].decision.details, undefined);
  assert.deepEqual(validateFile(m), []);
  assert.deepEqual(migrateWorksheet(m), m);
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

const baseCandidate = (over = {}) => ({
  tag: 'swe-x', kind: 'new-rule', role: 'swe', targetFile: 'instructions/core/swe/swe-x.md',
  gap: 'g', priority: 'high', decision: { verdict: 'park' }, ...over,
});

test('validateCandidate accepts a well-formed park candidate', () => {
  assert.deepEqual(validateCandidate(baseCandidate()), []);
});

test('validateCandidate rejects bad priority, bad verdict, stray draft, details on non-reject', () => {
  assert.ok(validateCandidate(baseCandidate({ priority: 'urgent' })).some((m) => m.includes('priority')));
  assert.ok(validateCandidate(baseCandidate({ decision: { verdict: 'maybe' } })).some((m) => m.includes('verdict')));
  assert.ok(validateCandidate(baseCandidate({ draft: 'x' })).some((m) => m.includes('draft')));
  assert.ok(validateCandidate(baseCandidate({ decision: { verdict: 'wanted', details: 'no' } })).some((m) => m.includes('details')));
});

test('validateCandidate allows optional details on reject', () => {
  assert.deepEqual(validateCandidate(baseCandidate({ decision: { verdict: 'reject', details: 'dupe' } })), []);
  assert.deepEqual(validateCandidate(baseCandidate({ decision: { verdict: 'reject' } })), []);
});

const baseScorecard = (over = {}) => ({
  lenses: ['swe', 'qa'],
  perLens: [{ dimension: 'coverage', cells: [{ lens: 'swe', verdict: 'good' }, { lens: 'qa', verdict: 'weak' }] }],
  global: [{ dimension: 'cohesiveness', verdict: 'strong' }],
  details: [{ dimension: 'coverage', lens: 'qa', file: 'f', tag: 't', note: 'n' }],
  nits: ['x'], ...over,
});

test('validateScorecard accepts null and a well-formed scorecard', () => {
  assert.deepEqual(validateScorecard(null), []);
  assert.deepEqual(validateScorecard(baseScorecard()), []);
  assert.deepEqual(validateScorecard({ lenses: [], perLens: [], global: [], details: [], nits: [] }), []);
});

test('validateScorecard rejects bad verdict and matrix misalignment', () => {
  assert.ok(validateScorecard(baseScorecard({
    perLens: [{ dimension: 'coverage', cells: [{ lens: 'swe', verdict: 'nope' }, { lens: 'qa', verdict: 'good' }] }],
  })).some((m) => m.includes('verdict')));
  // wrong cell count
  assert.ok(validateScorecard(baseScorecard({
    perLens: [{ dimension: 'coverage', cells: [{ lens: 'swe', verdict: 'good' }] }],
  })).some((m) => m.includes('cells.length')));
  // wrong cell lens vs lenses[i]
  assert.ok(validateScorecard(baseScorecard({
    perLens: [{ dimension: 'coverage', cells: [{ lens: 'qa', verdict: 'good' }, { lens: 'swe', verdict: 'good' }] }],
  })).some((m) => m.includes('!= lenses')));
});

test('validateFile is lenient on absent scorecard/candidates but flags present-malformed + dup/overlap', () => {
  const ok = { round: 'r', entries: [baseStrengthen()] };
  assert.deepEqual(validateFile(ok), []); // no scorecard/candidates keys -> still valid
  const dup = { round: 'r', entries: [], candidates: [baseCandidate(), baseCandidate()] };
  assert.ok(validateFile(dup).some((m) => m.includes('duplicate tag')));
  const overlap = { round: 'r', entries: [baseStrengthen()], candidates: [baseCandidate({ tag: baseStrengthen().tag })] };
  assert.ok(validateFile(overlap).some((m) => m.includes('both entries and candidates')));
  const badSc = { round: 'r', entries: [], scorecard: { lenses: 'no', perLens: [], global: [], details: [], nits: [] } };
  assert.ok(validateFile(badSc).some((m) => m.includes('lenses')));
});

test('migrateWorksheet v3 adds scorecard:null + candidates:[] and stays idempotent', () => {
  const m = migrateWorksheet({ round: 'r', entries: [] });
  assert.equal(m.scorecard, null);
  assert.deepEqual(m.candidates, []);
  assert.deepEqual(migrateWorksheet(m), m);
});

test('migrateWorksheet normalizes string nits to { text } objects (idempotent)', () => {
  const m = migrateWorksheet({ round: 'r', entries: [], scorecard: { lenses: [], perLens: [], global: [], details: [], nits: ['a typo', { text: 'b', fix: 'auto' }] } });
  assert.deepEqual(m.scorecard.nits, [{ text: 'a typo' }, { text: 'b', fix: 'auto' }]);
  assert.deepEqual(migrateWorksheet(m).scorecard.nits, m.scorecard.nits);
});

test('validateScorecard accepts string + {text,fix} nits, rejects bad fix / missing text', () => {
  assert.deepEqual(validateScorecard(baseScorecard({ nits: ['x', { text: 'y' }, { text: 'z', fix: 'auto' }] })), []);
  assert.ok(validateScorecard(baseScorecard({ nits: [{ text: 'y', fix: 'later' }] })).some((m) => m.includes('fix')));
  assert.ok(validateScorecard(baseScorecard({ nits: [{ fix: 'auto' }] })).some((m) => m.includes('string or')));
});
