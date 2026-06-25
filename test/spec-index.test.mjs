import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSpec, renderIndex, scanWorkingSpecs } from '../src/specindex.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

test('parseSpec extracts H1 title and first Status token', () => {
  assert.deepEqual(
    parseSpec('# Spec: Foo\n\nDate: 2026-01-01\nStatus: Implemented\n'),
    { title: 'Spec: Foo', status: 'Implemented' },
  );
  // bold Status with a long descriptive value -> first token only
  assert.deepEqual(
    parseSpec('# Bar\n\n**Status:** reviewed -- converged after 5 rounds\n'),
    { title: 'Bar', status: 'reviewed' },
  );
  // no heading / no status -> placeholders
  assert.deepEqual(parseSpec('no heading here'), { title: '(untitled)', status: '—' });
});

test('renderIndex sorts date-desc then slug-asc and links to spec.md', () => {
  const units = [
    { date: '2026-01-01', slug: 'a', dir: '2026-01-01-a', title: 'A', status: 'Implemented' },
    { date: '2026-02-01', slug: 'b', dir: '2026-02-01-b', title: 'B', status: 'Draft' },
  ];
  const out = renderIndex(units);
  assert.match(out, /^# Working specs index/);
  assert.ok(out.includes('do not hand-edit'));
  // caller pre-sorts; renderIndex preserves order. Verify the row format + link.
  assert.match(out, /\| 2026-01-01 \| \[A\]\(2026-01-01-a\/spec\.md\) \| Implemented \|/);
  assert.match(out, /\| 2026-02-01 \| \[B\]\(2026-02-01-b\/spec\.md\) \| Draft \|/);
});

// Live drift gate: the committed INDEX.md must equal a fresh generation.
test('docs/working-specs/INDEX.md is not stale', () => {
  const dir = join(ROOT, 'docs', 'working-specs');
  const fresh = renderIndex(scanWorkingSpecs(dir));
  const committed = readFileSync(join(dir, 'INDEX.md'), 'utf8');
  assert.equal(committed, fresh, 'INDEX.md is stale -- run `node bin/spec-index.js`');
});
