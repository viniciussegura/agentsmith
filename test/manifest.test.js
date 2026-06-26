import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  manifestPath, readManifest, orphanPaths, pruneOrphans, writeManifest, MANIFEST_REL,
} from '../src/manifest.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'agentsmith-mf-'));

test('orphanPaths is the pure set difference prev - current', () => {
  assert.deepEqual(
    orphanPaths(['a', 'b', 'c'], ['b', 'd']),
    ['a', 'c'],
  );
  assert.deepEqual(orphanPaths([], ['x']), []);
  assert.deepEqual(orphanPaths(['x'], []), ['x']);
});

test('readManifest returns empty paths when absent or malformed', () => {
  const base = tmp();
  try {
    assert.deepEqual(readManifest(base), { version: 1, paths: [] });
    mkdirSync(join(base, '.agentsmith'), { recursive: true });
    writeFileSync(manifestPath(base), 'not json{');
    assert.deepEqual(readManifest(base), { version: 1, paths: [] });
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('writeManifest then readManifest round-trips, sorted and deduped', () => {
  const base = tmp();
  try {
    const returned = writeManifest(base, ['b/x.md', 'a.md', 'b/x.md'], '2026-06-26T00:00:00.000Z');
    assert.equal(returned, manifestPath(base));
    assert.equal(existsSync(manifestPath(base)), true);
    const m = readManifest(base);
    assert.deepEqual(m.paths, ['a.md', 'b/x.md']);
    assert.equal(m.version, 1);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('pruneOrphans deletes only listed paths and removes emptied dirs', () => {
  const base = tmp();
  try {
    // a recorded orphan in its own dir, plus an unrelated consumer file
    mkdirSync(join(base, '.claude/commands'), { recursive: true });
    writeFileSync(join(base, '.claude/commands/agentsmith-ghost.md'), 'ghost');
    writeFileSync(join(base, '.claude/commands/my-own.md'), 'mine');

    const deleted = pruneOrphans(base, ['.claude/commands/agentsmith-ghost.md']);
    assert.deepEqual(deleted, ['.claude/commands/agentsmith-ghost.md']);
    assert.equal(existsSync(join(base, '.claude/commands/agentsmith-ghost.md')), false, 'orphan deleted');
    assert.equal(existsSync(join(base, '.claude/commands/my-own.md')), true, 'unlisted consumer file spared');
    // dir still has my-own.md, so it must NOT be removed
    assert.equal(existsSync(join(base, '.claude/commands')), true, 'non-empty dir kept');
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('pruneOrphans removes a directory the deletion emptied but keeps non-empty ancestors', () => {
  const base = tmp();
  try {
    mkdirSync(join(base, '.claude/skills/agentsmith-old'), { recursive: true });
    mkdirSync(join(base, '.claude/skills/keep'), { recursive: true });
    writeFileSync(join(base, '.claude/skills/agentsmith-old/SKILL.md'), 'x');
    writeFileSync(join(base, '.claude/skills/keep/SKILL.md'), 'keep');
    pruneOrphans(base, ['.claude/skills/agentsmith-old/SKILL.md']);
    assert.equal(existsSync(join(base, '.claude/skills/agentsmith-old')), false, 'emptied dir removed');
    assert.equal(existsSync(join(base, '.claude/skills')), true, 'ancestor with siblings kept');
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('pruneOrphans removes a multi-level chain the deletion emptied', () => {
  const base = mkdtempSync(join(tmpdir(), 'agentsmith-mf-'));
  try {
    mkdirSync(join(base, '.claude/skills/agentsmith-old'), { recursive: true });
    writeFileSync(join(base, '.claude/skills/agentsmith-old/SKILL.md'), 'x');
    pruneOrphans(base, ['.claude/skills/agentsmith-old/SKILL.md']);
    assert.equal(existsSync(join(base, '.claude/skills/agentsmith-old')), false, 'leaf dir removed');
    assert.equal(existsSync(join(base, '.claude/skills')), false, 'emptied parent removed');
    assert.equal(existsSync(join(base, '.claude')), false, 'emptied grandparent removed');
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('pruneOrphans is a no-op for a path that no longer exists', () => {
  const base = tmp();
  try {
    assert.deepEqual(pruneOrphans(base, ['.claude/commands/gone.md']), []);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
