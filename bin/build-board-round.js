#!/usr/bin/env node
// Generate the self-contained board-round.mjs Workflow script from round-body.mjs
// (the tested source). A drift test (test/board-round-render.test.mjs) asserts the
// committed board-round.mjs equals this output.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderBoardRound } from '../src/boardround.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'tools', 'claude', 'skills', 'code-review-board');
const body = readFileSync(join(dir, 'round-body.mjs'), 'utf8');
const dest = join(dir, 'board-round.mjs');
writeFileSync(dest, renderBoardRound(body));
process.stderr.write(`agentsmith: wrote ${dest}\n`);
