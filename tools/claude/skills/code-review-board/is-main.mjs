// Was this module invoked as the CLI, or merely imported?
//
// The naive form -- `fileURLToPath(import.meta.url) === resolve(argv[1])` -- is
// wrong wherever the script is reached through a link, which is the DOCUMENTED
// install path: a plugin install exposes each skill at `.claude/skills/<name>`,
// a symlink into the plugin cache. `resolve()` absolutizes without following
// links while Node's ESM loader canonicalizes `import.meta.url` through realpath,
// so the two never match, the guard reads false, and the entire CLI block is
// skipped -- exit 0, no output, indistinguishable from a successful run.
//
// One home for the comparison, because the failure it prevents is silent and the
// three call sites in this directory would otherwise each carry their own copy of
// the reasoning above (`#swe-reuse`).

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * True when `moduleUrl` is the entry point named by `argvPath`.
 *
 * @param {string} moduleUrl  the caller's `import.meta.url`
 * @param {string|undefined} argvPath  `process.argv[1]`
 * @returns {boolean}
 */
export function isMain(moduleUrl, argvPath) {
  if (!argvPath) return false;
  // An argv[1] that is not on disk cannot be a link either: fall back to the
  // absolutized form rather than throwing.
  let entry;
  try {
    entry = realpathSync(resolve(argvPath));
  } catch {
    entry = resolve(argvPath);
  }
  return fileURLToPath(moduleUrl) === entry;
}
