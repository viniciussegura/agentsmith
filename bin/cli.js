#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { generate } from '../src/generate.js';

// Resolve sources relative to the package, not the consumer's cwd.
const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(pkgRoot, 'manifest.json'), 'utf8'));
const read = (rel) => readFileSync(join(pkgRoot, rel), 'utf8');

// Stamp the header with the source revision. Describes the instruction repo
// (pkgRoot), not the consumer's project. Silently skipped outside a git repo.
function sourceRevision() {
  const git = (args) => execFileSync('git', args, { cwd: pkgRoot }).toString().trim();
  try {
    const commit = git(['rev-parse', '--short', 'HEAD']);
    const date = git(['log', '-1', '--format=%cd', '--date=short']);
    const dirty = git(['status', '--porcelain']) !== '';
    return { commit: dirty ? `${commit}-dirty` : commit, date };
  } catch {
    return {};
  }
}

const { commit, date } = sourceRevision();
const output = generate({
  preamble: read(manifest.preamble),
  modules: manifest.modules.map(read),
  source: manifest.source,
  commit,
  date,
});

const args = process.argv.slice(2);
if (args.includes('--stdout')) {
  process.stdout.write(output);
} else {
  const outIdx = args.indexOf('--out');
  const name = outIdx !== -1 ? args[outIdx + 1] : manifest.output;
  const dest = resolve(process.cwd(), name); // written into the consumer project
  writeFileSync(dest, output);
  process.stderr.write(`agentsmith: wrote ${dest}\n`);
}
