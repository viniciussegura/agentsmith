import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../devtools/triage-ui/apply.mjs';

const NOOP_GATE = () => {};

/** Build a temp repo: instructions/core/swe/{_intro,swe-x}.md, ownership.yaml,
 * decisions log with the three sections, and a triage.json with `entries`. */
function fixture(entries) {
  const root = mkdtempSync(join(tmpdir(), 'apply-'));
  mkdirSync(join(root, 'instructions/core/swe'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  mkdirSync(join(root, '.agentsmith/instruction-review'), { recursive: true });
  writeFileSync(join(root, 'instructions/core/swe/_intro.md'), '# Software engineering\n');
  writeFileSync(join(root, 'instructions/core/swe/swe-x.md'), '# #swe-x Old\n\nold body\n');
  writeFileSync(join(root, 'instructions/ownership.yaml'), 'owners:\n  # swe\n  swe-x: swe\n');
  writeFileSync(join(root, 'docs/instruction-rules-decisions.md'),
    '# Decisions\n\n## Deferred\n\n## Folded\n\n## Rejected\n\n- `#old` -- rejected: pre-existing.\n');
  const triagePath = join(root, '.agentsmith/instruction-review/triage.json');
  writeFileSync(triagePath, JSON.stringify({ round: '2026-06-18', entries }, null, 2) + '\n');
  return { root, triagePath };
}
const readTriage = (p) => JSON.parse(readFileSync(p, 'utf8'));

test('adopt strengthen overwrites the rule file and splices the entry', async () => {
  const { root, triagePath } = fixture([{
    tag: 'swe-x', role: 'swe', targetFile: 'instructions/core/swe/swe-x.md',
    status: { state: 'ready' }, gap: 'g', kind: 'strengthen',
    draft: '# #swe-x New\n\nnew body', decision: { verdict: 'adopt' }, applyLog: [],
  }]);
  try {
    const report = await apply({ root, triagePath, gate: NOOP_GATE });
    assert.deepEqual(report.adopted, ['swe-x']);
    assert.match(readFileSync(join(root, 'instructions/core/swe/swe-x.md'), 'utf8'), /# #swe-x New\n\nnew body/);
    assert.equal(readTriage(triagePath).entries.length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('adopt new-rule creates the file and the ownership row', async () => {
  const { root, triagePath } = fixture([{
    tag: 'swe-new', role: 'swe', targetFile: 'instructions/core/swe/swe-new.md',
    status: { state: 'ready' }, gap: 'g', kind: 'new-rule',
    draft: '# #swe-new New rule\n\nbody', decision: { verdict: 'adopt' }, applyLog: [],
  }]);
  try {
    const report = await apply({ root, triagePath, gate: NOOP_GATE });
    assert.ok(report.adopted.includes('swe-new'));
    assert.ok(existsSync(join(root, 'instructions/core/swe/swe-new.md')));
    assert.match(readFileSync(join(root, 'instructions/ownership.yaml'), 'utf8'), /^\s+swe-new: swe$/m);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('adopt new-rule writes the suggested owner (not the raising role) to ownership.yaml', async () => {
  // a frontend lens raises a ux-owned rule: owner must win over role.
  const { root, triagePath } = fixture([{
    tag: 'ui-thing', role: 'frontend', owner: 'ux', targetFile: 'instructions/core/swe/ui-thing.md',
    status: { state: 'ready' }, gap: 'g', kind: 'new-rule',
    draft: '# #ui-thing New\n\nbody', decision: { verdict: 'adopt' }, applyLog: [],
  }]);
  try {
    const report = await apply({ root, triagePath, gate: NOOP_GATE });
    assert.ok(report.adopted.includes('ui-thing'));
    const own = readFileSync(join(root, 'instructions/ownership.yaml'), 'utf8');
    assert.match(own, /^\s+ui-thing: ux$/m);
    assert.doesNotMatch(own, /ui-thing: frontend/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('reject writes a canonical decisions-log line and splices', async () => {
  const { root, triagePath } = fixture([{
    tag: 'foo', role: 'swe', targetFile: 'instructions/core/swe/foo.md',
    status: { state: 'ready' }, gap: 'g', kind: 'new-rule', draft: '# #foo',
    decision: { verdict: 'reject', details: 'because' }, applyLog: [],
  }]);
  try {
    const report = await apply({ root, triagePath, gate: NOOP_GATE });
    assert.deepEqual(report.rejected, ['foo']);
    assert.match(readFileSync(join(root, 'docs/instruction-rules-decisions.md'), 'utf8'),
      /^- `#foo` -- rejected: because$/m);
    assert.equal(readTriage(triagePath).entries.length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rehome/reowner are reported skipped, untouched', async () => {
  const { root, triagePath } = fixture([
    { tag: 'rh', role: 'swe', targetFile: 'instructions/core/swe/rh.md', status: { state: 'ready' },
      gap: 'g', kind: 'rehome', proposedFile: 'instructions/core/code/rh.md', decision: { verdict: 'adopt' }, applyLog: [] },
    { tag: 'ro', role: 'swe', targetFile: 'instructions/core/swe/ro.md', status: { state: 'ready' },
      gap: 'g', kind: 'reowner', proposedOwner: 'db', decision: { verdict: 'adopt' }, applyLog: [] },
  ]);
  try {
    const report = await apply({ root, triagePath, gate: NOOP_GATE });
    assert.deepEqual(report.skipped.sort(), ['rh', 'ro']);
    assert.equal(readTriage(triagePath).entries.length, 2); // untouched
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a failed adopt restores the file, KEEPS the verdict, and logs the reason', async () => {
  const { root, triagePath } = fixture([{
    tag: 'swe-x', role: 'swe', targetFile: 'instructions/core/swe/swe-x.md',
    status: { state: 'ready' }, gap: 'g', kind: 'strengthen',
    draft: '# #swe-x New\n\nnew body', decision: { verdict: 'adopt' }, applyLog: [],
  }]);
  try {
    const boom = () => { throw new Error('gate boom'); };
    const report = await apply({ root, triagePath, gate: boom });
    assert.equal(report.failed.length, 1);
    assert.equal(report.failed[0].tag, 'swe-x');
    assert.match(report.failed[0].reason, /gate boom/);
    // file restored to original
    assert.match(readFileSync(join(root, 'instructions/core/swe/swe-x.md'), 'utf8'), /# #swe-x Old/);
    // verdict PRESERVED (not silently re-parked) + applyLog appended, still present
    const e = readTriage(triagePath).entries[0];
    assert.equal(e.decision.verdict, 'adopt');
    assert.equal(e.applyLog.length, 1);
    assert.match(e.applyLog[0], /gate boom/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a failed adopt surfaces the gate STDOUT (node --test reports there, not stderr)', async () => {
  const { root, triagePath } = fixture([{
    tag: 'swe-x', role: 'swe', targetFile: 'instructions/core/swe/swe-x.md',
    status: { state: 'ready' }, gap: 'g', kind: 'strengthen',
    draft: '# #swe-x New\n\nnew body', decision: { verdict: 'adopt' }, applyLog: [],
  }]);
  try {
    // Mimic execFileSync throwing: TAP failure text on stdout, empty stderr.
    const boom = () => { const e = new Error('Command failed: node --test'); e.stdout = Buffer.from('not ok 70 - lean-split gate (cross-boundary)\n'); e.stderr = Buffer.from(''); throw e; };
    const report = await apply({ root, triagePath, gate: boom });
    assert.match(report.failed[0].reason, /lean-split gate/);
    assert.match(readTriage(triagePath).entries[0].applyLog[0], /lean-split gate/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('adopt new-rule with a #-prefixed tag writes a HASHLESS ownership row', async () => {
  const { root, triagePath } = fixture([{
    tag: '#swe-new', role: 'swe', targetFile: 'instructions/core/swe/swe-new.md',
    status: { state: 'ready' }, gap: 'g', kind: 'new-rule',
    draft: '# #swe-new New rule\n\nbody', decision: { verdict: 'adopt' }, applyLog: [],
  }]);
  try {
    const report = await apply({ root, triagePath, gate: NOOP_GATE });
    assert.ok(report.adopted.includes('#swe-new'));
    const own = readFileSync(join(root, 'instructions/ownership.yaml'), 'utf8');
    assert.match(own, /^\s+swe-new: swe$/m); // hashless, matches every other row
    assert.doesNotMatch(own, /#swe-new:/);   // never the doubled/hashed form
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('reject with a #-prefixed tag writes a single-hash decisions line', async () => {
  const { root, triagePath } = fixture([{
    tag: '#foo', role: 'swe', targetFile: 'instructions/core/swe/foo.md',
    status: { state: 'ready' }, gap: 'g', kind: 'new-rule', draft: '# #foo',
    decision: { verdict: 'reject', details: 'because' }, applyLog: [],
  }]);
  try {
    await apply({ root, triagePath, gate: NOOP_GATE });
    const log = readFileSync(join(root, 'docs/instruction-rules-decisions.md'), 'utf8');
    assert.match(log, /^- `#foo` -- rejected: because$/m); // single hash
    assert.doesNotMatch(log, /##foo/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('onProgress emits start, begin, gate, and done for an adopt', async () => {
  const { root, triagePath } = fixture([{
    tag: 'swe-x', role: 'swe', targetFile: 'instructions/core/swe/swe-x.md',
    status: { state: 'ready' }, gap: 'g', kind: 'strengthen',
    draft: '# #swe-x New\n\nnew body', decision: { verdict: 'adopt' }, applyLog: [],
  }]);
  try {
    const events = [];
    await apply({ root, triagePath, gate: NOOP_GATE, onProgress: (ev) => events.push(ev) });
    assert.deepEqual(events[0], { type: 'start', total: 1 });
    assert.equal(events[1].phase, 'begin');
    assert.equal(events[1].tag, 'swe-x');
    assert.ok(events.some((e) => e.phase === 'gate'), 'gate event before runGate');
    const done = events.find((e) => e.phase === 'done');
    assert.equal(done.outcome, 'adopted');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('auto-flagged nit is surfaced in report.nits; manual nit is not', async () => {
  const { root, triagePath } = fixture([]);
  const f = JSON.parse(readFileSync(triagePath, 'utf8'));
  f.scorecard = { lenses: [], perLens: [], global: [], details: [], nits: [{ text: 'fix dead path in X', fix: 'auto' }, { text: 'manual one' }] };
  writeFileSync(triagePath, JSON.stringify(f, null, 2) + '\n');
  try {
    const report = await apply({ root, triagePath, gate: NOOP_GATE });
    assert.deepEqual(report.nits, ['fix dead path in X']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('empty / missing worksheet reports nothing to apply', async () => {
  const { root, triagePath } = fixture([]);
  try {
    assert.deepEqual(await apply({ root, triagePath, gate: NOOP_GATE }), { error: 'nothing to apply' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function fixtureC(entries, candidates) {
  const { root, triagePath } = fixture(entries);
  const f = JSON.parse(readFileSync(triagePath, 'utf8'));
  f.candidates = candidates;
  writeFileSync(triagePath, JSON.stringify(f, null, 2) + '\n');
  return { root, triagePath };
}

test('wanted candidate is surfaced and left in place', async () => {
  const { root, triagePath } = fixtureC([], [{
    tag: 'swe-new', kind: 'new-rule', role: 'swe', targetFile: 'instructions/core/swe/swe-new.md',
    gap: 'g', priority: 'high', decision: { verdict: 'wanted' },
  }]);
  try {
    const report = await apply({ root, triagePath, gate: NOOP_GATE });
    assert.deepEqual(report.wanted, ['swe-new']);
    assert.equal(readTriage(triagePath).candidates.length, 1); // left
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('reject candidate logs a decisions line and splices', async () => {
  const { root, triagePath } = fixtureC([], [{
    tag: 'swe-bad', kind: 'new-rule', role: 'swe', targetFile: 'instructions/core/swe/swe-bad.md',
    gap: 'g', priority: 'low', decision: { verdict: 'reject', details: 'dupe of swe-x' },
  }]);
  try {
    const report = await apply({ root, triagePath, gate: NOOP_GATE });
    assert.deepEqual(report.ignored, ['swe-bad']);
    assert.match(readFileSync(join(root, 'docs/instruction-rules-decisions.md'), 'utf8'),
      /^- `#swe-bad` -- rejected: dupe of swe-x$/m);
    assert.equal(readTriage(triagePath).candidates.length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('reject candidate without details defaults to "not pursued"', async () => {
  const { root, triagePath } = fixtureC([], [{
    tag: 'swe-bad2', kind: 'new-rule', role: 'swe', targetFile: 'instructions/core/swe/swe-bad2.md',
    gap: 'g', priority: 'low', decision: { verdict: 'reject' },
  }]);
  try {
    await apply({ root, triagePath, gate: NOOP_GATE });
    assert.match(readFileSync(join(root, 'docs/instruction-rules-decisions.md'), 'utf8'),
      /^- `#swe-bad2` -- rejected: not pursued$/m);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a file with only candidates is not short-circuited as nothing-to-apply', async () => {
  const { root, triagePath } = fixtureC([], [{
    tag: 'swe-w', kind: 'new-rule', role: 'swe', targetFile: 'instructions/core/swe/swe-w.md',
    gap: 'g', priority: 'high', decision: { verdict: 'wanted' },
  }]);
  try {
    const report = await apply({ root, triagePath, gate: NOOP_GATE });
    assert.ok(!report.error, 'must process, not return nothing-to-apply');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('onProgress emits candidate events', async () => {
  const { root, triagePath } = fixtureC([], [{
    tag: 'swe-w2', kind: 'new-rule', role: 'swe', targetFile: 'instructions/core/swe/swe-w2.md',
    gap: 'g', priority: 'high', decision: { verdict: 'wanted' },
  }]);
  try {
    const events = [];
    await apply({ root, triagePath, gate: NOOP_GATE, onProgress: (e) => events.push(e) });
    const c = events.find((e) => e.type === 'candidate');
    assert.equal(c.tag, 'swe-w2');
    assert.equal(c.outcome, 'wanted');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
