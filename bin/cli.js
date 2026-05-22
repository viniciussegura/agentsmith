#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { generate } from '../src/generate.js';

// Resolve sources relative to the package, not the consumer's cwd.
const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(pkgRoot, 'manifest.json'), 'utf8'));
const read = (rel) => readFileSync(join(pkgRoot, rel), 'utf8');

const output = generate({
  preamble: read(manifest.preamble),
  modules: manifest.modules.map(read),
  source: manifest.source,
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
