import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { DATA_OPEN, DATA_CLOSE } from '../tools/claude/skills/code-review-board/round-args.mjs';
import { escapeRegExp } from '../test-helpers/escape-regexp.mjs';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const SOURCE_PLACEHOLDER = '<source>';
const RETIRED_FORM = /UNTRUSTED DATA/;
// Anything that looks like a data sentinel, in any form: a `---` fence naming DATA.
const SENTINEL_LIKE = /---\s*(BEGIN\s+|END\s+)?(UNTRUSTED\s+)?DATA\b[^\n]*---/i;
// The sites known to spell the sentinel; the sweep must find at least these, or it is not looking.
const KNOWN_SITES = [
  'instructions/core/swe/swe-prompt-injection-sentinel.md',
  'tools/claude/skills/code-review-board/reviewer-common.md',
  'docs/reference-spec/review-board-protocol.md',
  'tools/claude/skills/code-review-board/round-args.mjs',
];
// This file names the retired form as the pattern it rejects, so it is not a site.
const SELF = 'test/sentinel-form.test.mjs';

const unwrapped = (text) => text.replace(/\s+/g, ' ');
// The open form with any concrete source: a doc may show a worked example (#swe-public-surface-docs).
const OPEN_ANY_SOURCE = new RegExp(`^${escapeRegExp(DATA_OPEN('\u0000')).replace('\u0000', '[^\n]+?')}$`);
// One fence per match: lazy up to the closing `---`, since the text has had its newlines collapsed.
const SENTINEL_LINE = /---\s*(BEGIN\s+|END\s+)?(UNTRUSTED\s+)?DATA\b[^\n]*?---/gi;
// Prose and source alike: a JS template string re-spelling the sentinel is the drift the
// rule's one-shared-constant clause forbids.
const trackedSources = () =>
  execFileSync('git', ['ls-files', '--', '*.md', '*.mjs', '*.js'], { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/).filter((f) => f && f !== SELF);

// #swe-prompt-injection-sentinel: the rule text and the exported constant are one source of
// truth, and every prose site that re-spells the sentinel must move with them. The sweep
// finds the sites, so a new one cannot stay invisible by not being listed here.
test('every tracked source or document that spells a data sentinel uses the exported form', () => {
  const sites = trackedSources().filter((f) => SENTINEL_LIKE.test(readFileSync(resolve(root, f), 'utf8')));
  for (const known of KNOWN_SITES) assert.ok(sites.includes(known), `sweep missed ${known}`);
  for (const site of sites) {
    const text = unwrapped(readFileSync(resolve(root, site), 'utf8'));
    assert.ok(!RETIRED_FORM.test(text), `${site} still carries the retired sentinel form`);
    for (const fence of text.match(SENTINEL_LINE) || []) {
      assert.ok(OPEN_ANY_SOURCE.test(fence) || fence === DATA_CLOSE, `${site} spells a sentinel the implementation does not: ${fence}`);
    }
  }
});

test('the rule module states the form with the <source> placeholder', () => {
  const text = unwrapped(readFileSync(resolve(root, KNOWN_SITES[0]), 'utf8'));
  assert.ok(text.includes(DATA_OPEN(SOURCE_PLACEHOLDER)), `rule lacks ${DATA_OPEN(SOURCE_PLACEHOLDER)}`);
  assert.ok(text.includes(DATA_CLOSE), `rule lacks ${DATA_CLOSE}`);
});

test('the sweep accepts a worked example with a concrete source', () => {
  const example = unwrapped(`${DATA_OPEN('commit messages')}\nfeat: x\n${DATA_CLOSE}`);
  for (const fence of example.match(SENTINEL_LINE) || []) {
    assert.ok(OPEN_ANY_SOURCE.test(fence) || fence === DATA_CLOSE, fence);
  }
  assert.equal((example.match(SENTINEL_LINE) || []).length, 2);
});

test('site discovery catches a lone retired closing fence', () => {
  assert.ok(SENTINEL_LIKE.test('some prose\n--- END UNTRUSTED DATA ---\n'), 'retired close not selected');
  assert.ok(SENTINEL_LIKE.test(`${DATA_CLOSE}\n`), 'current close not selected');
  assert.ok(SENTINEL_LIKE.test(`${DATA_OPEN('x')}\n`), 'current open not selected');
});
