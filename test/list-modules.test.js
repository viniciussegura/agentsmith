import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeListModules } from '../bin/cli.js';

test('listModules: branch dir recurses alpha; _intro first; demote by role', () => {
  const root = mkdtempSync(join(tmpdir(), 'lm-'));
  try {
    mkdirSync(join(root, 'instructions/core/swe'), { recursive: true });
    mkdirSync(join(root, 'instructions/core/ai'), { recursive: true });
    mkdirSync(join(root, 'instructions/backend'), { recursive: true });
    for (const [p, c] of [
      ['instructions/core/swe/_intro.md', '# SWE'],
      ['instructions/core/swe/swe-reuse.md', '# #swe-reuse'],
      ['instructions/core/swe/swe-async.md', '# #swe-async'],
      ['instructions/core/ai/_intro.md', '# AI'],
      ['instructions/core/ai/ai-plan.md', '# #ai-plan'],
      ['instructions/backend/_intro.md', '# Back-end instructions'],
      ['instructions/backend/be-api-first.md', '# #be-api-first'],
    ]) writeFileSync(join(root, p), c);

    const listModules = makeListModules(root);
    assert.deepEqual(listModules('core'), [
      { path: 'instructions/core/ai/_intro.md', demote: 1 },
      { path: 'instructions/core/ai/ai-plan.md', demote: 2 },
      { path: 'instructions/core/swe/_intro.md', demote: 1 },
      { path: 'instructions/core/swe/swe-async.md', demote: 2 },
      { path: 'instructions/core/swe/swe-reuse.md', demote: 2 },
    ]);
    assert.deepEqual(listModules('backend'), [
      { path: 'instructions/backend/_intro.md', demote: 1 },
      { path: 'instructions/backend/be-api-first.md', demote: 2 },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('listModules: a dir mixing subdirs and .md files fails loud', () => {
  const root = mkdtempSync(join(tmpdir(), 'lm-mix-'));
  try {
    mkdirSync(join(root, 'instructions/core/sub'), { recursive: true });
    writeFileSync(join(root, 'instructions/core/sub/_intro.md'), '# Sub');
    writeFileSync(join(root, 'instructions/core/stray.md'), '# #stray'); // sibling of a subdir
    const listModules = makeListModules(root);
    assert.throws(() => listModules('core'), /mixed branch\/leaf dir/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
