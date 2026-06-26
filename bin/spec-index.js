#!/usr/bin/env node
// Regenerate or --check docs/working-specs/INDEX.md for the project in CWD (#ai-plan).
// Thin shim over runSpecIndex; also reachable as `agentsmith spec-index [--check]`.
import { runSpecIndex } from '../src/specindex.js';

const check = process.argv.includes('--check');
const r = runSpecIndex({ cwd: process.cwd(), check });

if (r.missing) {
  process.stderr.write(`agentsmith: no docs/working-specs/ in ${process.cwd()} -- nothing to index\n`);
  process.exit(0);
}
if (check) {
  process.stderr.write(
    r.ok
      ? `agentsmith: ${r.path} is current\n`
      : `agentsmith: ${r.path} is STALE -- run \`agentsmith spec-index\` to regenerate\n`,
  );
  process.exit(r.ok ? 0 : 1);
}
process.stderr.write(`agentsmith: wrote ${r.path}\n`);
