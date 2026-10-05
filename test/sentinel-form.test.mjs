import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_OPEN, DATA_CLOSE } from '../tools/claude/skills/code-review-board/round-args.mjs';

const RULE_MODULE = join('instructions', 'core', 'swe', 'swe-prompt-injection-sentinel.md');
const SOURCE_PLACEHOLDER = '<source>';

// #swe-prompt-injection-sentinel: the form the rule documents and the exported constant
// are a single source of truth, so a divergence between them fails here.
test('the sentinel rule states exactly the form the implementation exports', () => {
  const rule = readFileSync(RULE_MODULE, 'utf8');
  assert.ok(rule.includes(DATA_OPEN(SOURCE_PLACEHOLDER)), `rule lacks ${DATA_OPEN(SOURCE_PLACEHOLDER)}`);
  assert.ok(rule.includes(DATA_CLOSE), `rule lacks ${DATA_CLOSE}`);
  assert.ok(!/UNTRUSTED DATA/.test(rule), 'rule still carries the retired sentinel form');
});
