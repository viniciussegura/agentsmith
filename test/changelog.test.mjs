import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');

// A versioned entry heading: `## 1.0.0-rc.27` while the PR is open, `## 1.0.0 -- 2026-10-06` once
// the human cuts the release (#local-pr-version). `## Earlier` matches neither.
const VERSION_HEADING = /^## (\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)( -- \d{4}-\d{2}-\d{2})?$/;
const DIGIT_HEADING = /^## \d/;

// The first versioned heading must carry package.json's version: a bump with no entry fails.
// Returns the problems found; an empty list means the changelog is current.
export function changelogProblems(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  for (const line of lines) {
    const m = VERSION_HEADING.exec(line);
    if (m) {
      return m[1] === version ? [] : [`first versioned heading is ${m[1]}, package.json is ${version}`];
    }
    if (DIGIT_HEADING.test(line)) return [`malformed version heading: ${JSON.stringify(line)}`];
  }
  return [`no versioned heading found for ${version}`];
}

test('a pre-release heading carrying the package version passes', () => {
  assert.deepEqual(changelogProblems('# Changelog\n\npreamble\n\n## 1.0.0-rc.27\n\n- x\n\n## Earlier\n', '1.0.0-rc.27'), []);
});

test('a dated release heading carrying the package version passes', () => {
  assert.deepEqual(changelogProblems('# Changelog\n\n## 1.0.0 -- 2026-10-06\n\n- x\n', '1.0.0'), []);
});

test('a heading for another version fails', () => {
  const problems = changelogProblems('## 1.0.0-rc.27\n', '1.0.0-rc.28');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /1\.0\.0-rc\.27.*1\.0\.0-rc\.28/);
});

test('a changelog with only the Earlier heading fails', () => {
  assert.match(changelogProblems('# Changelog\n\n## Earlier\n\n- x\n', '1.0.0-rc.27')[0], /no versioned heading/);
});

test('a heading that starts with a digit but is not a version is reported, not skipped', () => {
  const problems = changelogProblems('## 1.0.0-rc.27 (PR #27)\n\n## 1.0.0-rc.27\n', '1.0.0-rc.27');
  assert.match(problems[0], /malformed/);
});

test('CHANGELOG.md carries the current package version', () => {
  const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
  const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8');
  assert.deepEqual(changelogProblems(changelog, version), []);
});
