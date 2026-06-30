// round-guard.mjs is the post-round containment for the review boards: reviewers carry
// Write, so a round ends by asserting nothing was written outside the gitignored scratch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GUARD = fileURLToPath(new URL('../tools/claude/skills/code-review-board/round-guard.mjs', import.meta.url));
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const run = (args) => execFileSync('node', [GUARD, ...args], { encoding: 'utf8' });

test('round-guard: snapshot then immediate check is clean (no porcelain delta)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rg-'));
  try {
    const base = join(dir, 'baseline.txt');
    assert.match(run(['snapshot', base]), /snapshot: ok/);
    assert.match(run(['check', base]), /clean/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('round-guard: check fails when a write escapes the baseline', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rg-'));
  const stray = join(ROOT, '.rg-guard-test-artifact'); // new, untracked, NOT gitignored
  try {
    const base = join(dir, 'baseline.txt');
    run(['snapshot', base]);          // capture the tree as-is
    writeFileSync(stray, 'escaped');  // simulate an agent writing outside scratch
    let code = 0;
    let out = '';
    try {
      run(['check', base]);
    } catch (err) {
      code = err.status;
      out = `${err.stdout || ''}${err.stderr || ''}`;
    }
    assert.equal(code, 1, 'a stray write must fail the guard');
    assert.match(out, /escaped scratch/);
  } finally {
    rmSync(stray, { force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});
