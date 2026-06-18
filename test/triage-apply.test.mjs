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

test('a failed adopt restores the file, re-parks, and logs', async () => {
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
    // file restored to original
    assert.match(readFileSync(join(root, 'instructions/core/swe/swe-x.md'), 'utf8'), /# #swe-x Old/);
    // entry re-parked + applyLog appended, still present
    const e = readTriage(triagePath).entries[0];
    assert.equal(e.decision.verdict, 'park');
    assert.equal(e.applyLog.length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('empty / missing worksheet reports nothing to apply', async () => {
  const { root, triagePath } = fixture([]);
  try {
    assert.deepEqual(await apply({ root, triagePath, gate: NOOP_GATE }), { error: 'nothing to apply' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
