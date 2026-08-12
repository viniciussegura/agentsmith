import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { makeTempDir } from '../test-helpers/tmp-dir.mjs';

// The helper is the suite's only temp-dir cleanup site, and its failure mode is
// silent: drop the registration and every consuming test still passes while the
// directories accumulate again. The context is duck-typed so the registered hook
// can be run and its effect observed -- and so a switch to a different context
// method (afterEach) fails here rather than shipping.
test('makeTempDir creates a temp directory and registers a hook that removes it', (t) => {
  const hooks = [];
  const dir = makeTempDir({ after: (fn) => hooks.push(fn) }, 'tmp-helper-probe-');
  // The stub swallows the helper's own registration, so this test would leak the
  // directory on any assertion below failing -- the defect it exists to catch.
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  assert.ok(dir.startsWith(tmpdir()), 'created under os.tmpdir()');
  assert.ok(existsSync(dir), 'exists before cleanup runs');
  assert.equal(hooks.length, 1, 'registers exactly one hook');

  hooks[0]();
  assert.equal(existsSync(dir), false, 'the registered hook removes the directory');
});
