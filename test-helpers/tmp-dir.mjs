// Lives outside test/ deliberately: `node --test` discovers `**/test/**/*.?(c|m)js`,
// so a helper under test/ would be run as a test file that asserts nothing.
// The directory alone does not exempt a file: the basename patterns `test.*`,
// `test-*`, `*-test.*`, `*_test.*` and `*.test.*` are discovered anywhere in the
// tree, so a second helper here must avoid all five.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Retried because a Windows test can still hold a handle (an open socket's files,
// a just-closed server) when cleanup runs: EBUSY there would fail a passing test.
const REMOVE_RETRIES = 3;
const REMOVE_RETRY_DELAY_MS = 50;

// Make a temp dir under os.tmpdir() and register its removal on the test context,
// so it runs even when an assertion throws.
export function makeTempDir(t, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, {
    recursive: true,
    force: true,
    maxRetries: REMOVE_RETRIES,
    retryDelay: REMOVE_RETRY_DELAY_MS,
  }));
  return dir;
}
