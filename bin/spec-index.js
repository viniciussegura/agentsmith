#!/usr/bin/env node
// Regenerate docs/working-specs/INDEX.md from the working-spec corpus.
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanWorkingSpecs, renderIndex } from '../src/specindex.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'docs', 'working-specs');
const dest = join(dir, 'INDEX.md');
writeFileSync(dest, renderIndex(scanWorkingSpecs(dir)));
process.stderr.write(`agentsmith: wrote ${dest}\n`);
