import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { applyPlan } from '../src/execute.js';

test('applyPlan writes, merges settings, then prune removes an orphan', () => {
  const base = mkdtempSync(join(tmpdir(), 'as-exec-'));
  try {
    const ghost = join(base, '.claude/x.md'); mkdirSync(dirname(ghost), { recursive: true }); writeFileSync(ghost, 'g');
    applyPlan({ base, absolute: false, manifestPaths: [], ops: [
      { kind: 'prune', paths: ['.claude/x.md'] },
      { kind: 'write', path: '.agentsmith/AGENTS.md', content: 'CORE' },
      { kind: 'mergeSettings', path: '.claude/settings.json', commandPath: '.claude/hooks/agentsmith/require-explicit-model.mjs' },
    ] }, { pkgRoot: process.cwd(), log: () => {} });
    assert.equal(existsSync(ghost), false, 'orphan pruned');
    assert.equal(readFileSync(join(base, '.agentsmith/AGENTS.md'), 'utf8'), 'CORE');
    const s = JSON.parse(readFileSync(join(base, '.claude/settings.json'), 'utf8'));
    assert.ok(JSON.stringify(s).includes('/hooks/agentsmith/'), 'hook merged');
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('applyPlan unmergeSettings leaves a malformed settings.json untouched', () => {
  const base = mkdtempSync(join(tmpdir(), 'as-exec-'));
  try {
    const s = join(base, '.claude/settings.json'); mkdirSync(dirname(s), { recursive: true }); writeFileSync(s, '{ not json');
    applyPlan({ base, absolute: false, manifestPaths: [], ops: [{ kind: 'unmergeSettings', path: '.claude/settings.json' }] }, { pkgRoot: process.cwd(), log: () => {} });
    assert.equal(readFileSync(s, 'utf8'), '{ not json', 'left untouched');
  } finally { rmSync(base, { recursive: true, force: true }); }
});
