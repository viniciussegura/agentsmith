import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagFilenameLint } from '../src/bundles.js';

test('tagFilenameLint flags non-lowercase-leading tag files', () => {
  assert.deepEqual(tagFilenameLint(['instructions/core/swe/swe-reuse.md', 'instructions/core/swe/_intro.md']), []);
  assert.deepEqual(
    tagFilenameLint(['instructions/core/swe/Swe-Bad.md', 'instructions/core/swe/2-foo.md']),
    ['instructions/core/swe/Swe-Bad.md', 'instructions/core/swe/2-foo.md'],
  );
});
