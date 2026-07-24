import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceRevision } from '../src/revision.js';

test('uses git when available', () => {
  const runGit = (args) => (args[0] === 'rev-parse' ? 'abc1234' : args.includes('--format=%cd') ? '2026-07-23' : '');
  const r = sourceRevision({ pkgRoot: '/x', pkgVersion: '1.0.0-rc.17', runGit });
  assert.equal(r.commit, 'abc1234');
  assert.equal(r.date, '2026-07-23');
});

test('falls back to package version when git throws', () => {
  const runGit = () => { throw new Error('not a git repo'); };
  const r = sourceRevision({ pkgRoot: '/x', pkgVersion: '1.0.0-rc.17', runGit });
  assert.equal(r.commit, '1.0.0-rc.17');
  assert.equal(r.date, undefined);
});
