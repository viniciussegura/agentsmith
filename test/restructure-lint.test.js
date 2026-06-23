import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagFilenameLint } from '../src/bundles.js';
import { makeListModules } from '../bin/cli.js';

test('tagFilenameLint flags non-lowercase-leading tag files', () => {
  assert.deepEqual(tagFilenameLint(['instructions/core/swe/swe-reuse.md', 'instructions/core/swe/_intro.md']), []);
  assert.deepEqual(
    tagFilenameLint(['instructions/core/swe/Swe-Bad.md', 'instructions/core/swe/2-foo.md']),
    ['instructions/core/swe/Swe-Bad.md', 'instructions/core/swe/2-foo.md'],
  );
});

test('the real instruction tree has no non-lowercase tag filenames', () => {
  const lm = makeListModules(process.cwd());
  const paths = ['core', 'frontend', 'backend', 'authoring'].flatMap((s) => lm(s).map((x) => x.path));
  assert.ok(paths.length > 0, 'tree is non-empty');
  assert.deepEqual(tagFilenameLint(paths), []);
});
