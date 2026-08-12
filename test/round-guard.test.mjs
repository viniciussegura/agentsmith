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

// A MISSING baseline is not a containment violation: with nothing to diff against,
// every dirty path reads as new and a clean round gets indicted for the caller's
// path mistake. This is exactly what a Workflow subagent's non-inherited cwd
// produced -- an alarming exit 1 that was only ever a path artefact.
test('round-guard: a missing baseline exits 3, distinct from an escape', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rg-'));
  try {
    let code = 0;
    let out = '';
    try {
      run(['check', join(dir, 'never-written.txt')]);
    } catch (err) {
      code = err.status;
      out = `${err.stdout || ''}${err.stderr || ''}`;
    }
    assert.equal(code, 3, 'not 1 -- the check could not run, it did not find an escape');
    assert.match(out, /no baseline/i);
    assert.doesNotMatch(out, /escaped scratch/, 'never reports a containment violation it did not observe');
    assert.match(out, /did NOT run/, 'says plainly that no check happened');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('round-guard: both subcommands report the resolved baseline path and cwd', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rg-'));
  try {
    const base = join(dir, 'baseline.txt');
    const snap = run(['snapshot', base]);
    const check = run(['check', base]);
    for (const [name, out] of [['snapshot', snap], ['check', check]]) {
      assert.ok(out.includes(base), `${name} states where it resolved the baseline`);
      assert.match(out, /cwd /, `${name} states the cwd it resolved against`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('round-guard: a relative baseline resolves against the RUNNING cwd, and says so', () => {
  // Run from the repo (the guard shells out to git, so it needs one) with a
  // relative baseline under the gitignored tmp/, so the snapshot does not dirty
  // the tree it is measuring. The reported absolute path is what makes a cwd
  // mismatch legible instead of mysterious.
  const rel = 'tmp/rg-relative-baseline.txt';
  const opts = { encoding: 'utf8', cwd: ROOT };
  try {
    execFileSync('node', [GUARD, 'snapshot', rel], opts);
    const out = execFileSync('node', [GUARD, 'check', rel], opts);
    assert.match(out, /clean/);
    assert.ok(out.includes(join(ROOT, 'tmp', 'rg-relative-baseline.txt')), 'reports the absolute path it actually used');
  } finally {
    rmSync(join(ROOT, rel), { force: true });
  }
});
