import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_OPEN, DATA_CLOSE } from '../tools/claude/skills/code-review-board/round-args.mjs';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const SOURCE_PLACEHOLDER = '<source>';
const RETIRED_FORM = /UNTRUSTED DATA/;

// Every prose site that spells the sentinel. #swe-prompt-injection-sentinel makes the
// rule text and the exported constant one source of truth; the skill prose and the
// protocol document re-spell it for their readers and must move with it.
const SENTINEL_PROSE_SITES = [
  'instructions/core/swe/swe-prompt-injection-sentinel.md',
  'tools/claude/skills/code-review-board/reviewer-common.md',
  'docs/reference-spec/review-board-protocol.md',
];

const unwrapped = (text) => text.replace(/\s+/g, ' ');

for (const site of SENTINEL_PROSE_SITES) {
  test(`${site} states exactly the sentinel form the implementation exports`, () => {
    const text = unwrapped(readFileSync(resolve(root, site), 'utf8'));
    assert.ok(text.includes(DATA_OPEN(SOURCE_PLACEHOLDER)), `lacks ${DATA_OPEN(SOURCE_PLACEHOLDER)}`);
    assert.ok(text.includes(DATA_CLOSE), `lacks ${DATA_CLOSE}`);
    assert.ok(!RETIRED_FORM.test(text), 'still carries the retired sentinel form');
  });
}
