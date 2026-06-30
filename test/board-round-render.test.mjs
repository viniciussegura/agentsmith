// Renders board-round.mjs from round-body.mjs and gates it against the committed file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderBoardRound } from '../src/boardround.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const SKILL = join(ROOT, 'tools', 'claude', 'skills', 'code-review-board');

test('renderBoardRound makes a self-contained Workflow script: meta first, no import, no second export', () => {
  const out = renderBoardRound('const MODEL = {};\nexport async function runRound({ args }) { return args; }\n');
  // meta is the first statement (only comments precede it)
  const firstStmt = out.split('\n').find((l) => l.trim() && !l.trim().startsWith('//'));
  assert.match(firstStmt, /^export const meta = \{/);
  // the runRound export is stripped (a Workflow script forbids a second export)
  assert.doesNotMatch(out, /export async function runRound/);
  assert.match(out, /\basync function runRound\(/);
  assert.doesNotMatch(out, /^import /m);            // no static import
  assert.doesNotMatch(out, /\bimport\(/);            // no dynamic import
  // the guard parses the string args and runs only under the runtime
  assert.match(out, /typeof args === 'string' \? JSON\.parse\(args\) : args/);
  assert.match(out, /if \(typeof agent === 'function'\)/);
});

test('committed board-round.mjs is not stale (regenerate with `npm run build:board-round`)', () => {
  const body = readFileSync(join(SKILL, 'round-body.mjs'), 'utf8');
  const committed = readFileSync(join(SKILL, 'board-round.mjs'), 'utf8');
  assert.equal(committed, renderBoardRound(body), 'board-round.mjs is stale -- run `npm run build:board-round`');
});
