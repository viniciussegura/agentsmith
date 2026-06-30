#!/usr/bin/env node
// Round guard (#ai-review-engine safety net). A review round must write ONLY to its
// gitignored scratch/store. Reviewers, verifiers, and maintainers now carry the Write
// tool (so the file handoff the boards already command actually works), which means a
// misbehaving agent could in principle write outside scratch. This guard is the
// containment: it compares `git status --porcelain` taken before the round to the same
// set taken after, and fails if any path appears (or newly changes) that git does not
// ignore -- i.e. an agent escaped scratch and touched a tracked or otherwise-visible
// path. Legitimate round writes live under gitignored roots (.agentsmith/, .claude/),
// so a well-behaved round produces ZERO porcelain delta and the check is clean.
//
//   node round-guard.mjs snapshot <baseline-file>   # run BEFORE the round (main thread)
//   node round-guard.mjs check    <baseline-file>   # run AFTER the round; exit 1 on any escape
//
// Zero dependency. The baseline file itself should live under the gitignored scratch.
//
// Blind spot (acknowledged): a tracked file ALREADY dirty before the round yields the
// same porcelain line if a reviewer dirties it further, so additive writes to an
// already-modified tracked file are not caught. The realistic escape -- a reviewer
// mutating a previously-clean tracked source instead of its findings file -- IS caught.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { argv, stdout, stderr, exit } from 'node:process';

const splitLines = (s) => s.split('\n').map((l) => l.replace(/\r$/, '')).filter(Boolean);

// The porcelain set: one sorted line per dirty path, untracked files included
// (`?? path`), so a brand-new stray file outside the ignored roots is visible.
function porcelain() {
  const out = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' });
  return splitLines(out).sort();
}

const [cmd, file] = argv.slice(2);
if (!cmd || !file) {
  stderr.write('usage: round-guard.mjs <snapshot|check> <baseline-file>\n');
  exit(2);
}

if (cmd === 'snapshot') {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, porcelain().join('\n') + '\n');
  stdout.write('round-guard snapshot: ok\n');
} else if (cmd === 'check') {
  const before = new Set(existsSync(file) ? splitLines(readFileSync(file, 'utf8')) : []);
  const violations = porcelain().filter((line) => !before.has(line));
  if (violations.length) {
    stderr.write(`round-guard: ${violations.length} write(s) escaped scratch (path not gitignored):\n`);
    for (const v of violations) stderr.write(`  ${v}\n`);
    exit(1);
  }
  stdout.write('round-guard check: clean (no writes escaped scratch)\n');
} else {
  stderr.write(`round-guard: unknown command "${cmd}"\n`);
  exit(2);
}
