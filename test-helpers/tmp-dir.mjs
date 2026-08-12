// test-helpers/tmp-dir.mjs
//
// Lives outside test/ deliberately: `node --test` discovers `**/test/**/*.?(c|m)js`,
// so a helper under test/ would be run as a test file that asserts nothing.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Make a temp dir under os.tmpdir() and register its removal on the test context,
// so it runs even when an assertion throws.
export function withTempDir(t, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
