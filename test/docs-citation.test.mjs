// Gate over the past-unit citation convention (docs/reference-spec/documentation-model.md).
//
// Working specs are uncommitted branch scratch (#ai-plan), so a shipped unit
// cannot be linked -- it is cited in prose as `<YYYY-MM-DD> <name> (in git
// history)`. That convention is prose governed by no #tag, and the vocabulary
// guard in instruction-integrity.test.mjs deliberately does not walk docs/, so
// without this test nothing checks it. It shipped violated by 9 of 10 sites
// once already.
//
// The gate is DENY-BY-DEFAULT and that is the whole point. An earlier draft
// keyed on the marker -- "every `(in git history` needs a date" -- and caught
// none of those 9, because the real failure modes were the marker MISSING
// (`...unit violated it`), UNPARENTHESIZED (`...unit in git history`), or
// REORDERED (`(2026-06-09, in git history)`). A gate keyed on the well-formed
// shape can only ever find violations that already look well-formed.
//
// So: every line mentioning git history must EITHER match the citation form
// exactly, OR be listed below as deliberate non-citation prose. Writing new
// prose about git history therefore costs an allowlist entry -- which is the
// friction that makes the author decide whether they meant a citation.
//
// KNOWN BLIND SPOT, stated rather than papered over: a citation that omits the
// marker ENTIRELY ("the 2026-07-30 ephemeral-working-specs unit violated it")
// contains no `git history` text, so nothing here keys on it. Catching it means
// treating "a date near a unit-ish noun" as citation-shaped; measured against
// this corpus that yields 2 false positives and 0 true ones, so it is not worth
// the allowlist churn. This gate covers malformed markers, not absent ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const WALKED = ['docs', 'instructions', 'tools', 'devtools'];
const LOOSE_FILES = ['AGENTS.md', 'README.md', 'CONTRIBUTING.md'];
const EXTS = ['.md', '.mjs', '.js'];

const MENTIONS = /git history/;
// date, then the name, then the fixed marker closing it (optionally annotated).
const CITATION = /\d{4}-\d{2}-\d{2}[^(]*\(in git history(?:, [^)]+)?\)/;

// Lines that talk about git history as a MECHANISM, not as a citation of a
// past unit of work. Each is `<repo-relative path>: <distinctive substring>`.
const NON_CITATION_PROSE = [
  ['devtools/claude/skills/instruction-review-board/proposal-format.md', 'the dropped draft stays in git history'],
  ['docs/instruction-rules-decisions.md', 'Dropped drafts remain recoverable from git history'],
  ['instructions/core/ai/ai-review-board.md', 'the tracker and git history carry cross-machine continuity'],
  ['instructions/core/swe/swe-technical-debts.md', 'git history preserves the record'],
  ['tools/claude/skills/code-review-board/issue-format.md', '**git history** (fixed commits)'],
];

// The document that DEFINES the convention necessarily quotes the marker while
// explaining it, so its prose lines are exempt.
const DEFINITION = join('docs', 'reference-spec', 'documentation-model.md');

function walk(dir) {
  let out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else if (EXTS.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

function allowed(rel, line) {
  return NON_CITATION_PROSE.some(([f, frag]) => rel.split('\\').join('/') === f && line.includes(frag));
}

export function findBadCitations(files, readFile) {
  const bad = [];
  for (const rel of files) {
    if (rel === DEFINITION.split('\\').join('/')) continue;
    readFile(rel).split('\n').forEach((line, i) => {
      if (!MENTIONS.test(line)) return;
      if (CITATION.test(line) || allowed(rel, line)) return;
      bad.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`);
    });
  }
  return bad;
}

test('every git-history mention is a well-formed citation or declared non-citation prose', () => {
  const files = [
    ...WALKED.flatMap((d) => walk(join(ROOT, d))),
    ...LOOSE_FILES.map((f) => join(ROOT, f)),
  ].map((p) => relative(ROOT, p).split('\\').join('/'));
  const bad = findBadCitations(files, (rel) => readFileSync(join(ROOT, rel), 'utf8'));
  assert.deepEqual(bad, [], `not a well-formed past-unit citation, and not allowlisted:\n${bad.join('\n')}`);
});

// A malformed citation must actually be rejected. Without this, a later edit
// loosening CITATION would leave the gate passing over anything.
test('the citation gate rejects each shape that shipped broken', () => {
  const shapes = {
    'marker unparenthesized': 'see the 2026-06-17 triage-ui unit in git history.',
    'date inside the marker': 'the review-board landing (2026-06-09, in git history).',
    'annotation before the marker': 'The 2026-06-26 board-unification unit (§A, in git history) simplified it;',
    'marker detached from the name': "the rest of that unit's design discussion, are in git history.",
  };
  for (const [label, line] of Object.entries(shapes)) {
    const bad = findBadCitations(['docs/fake.md'], () => line);
    assert.equal(bad.length, 1, `gate accepted a ${label}: ${line}`);
  }
  // ...and accepts the canonical form.
  const good = 'Raised in the 2026-06-09 review-board unit (in git history) and carried forward.';
  assert.deepEqual(findBadCitations(['docs/fake.md'], () => good), []);
  const annotated = 'The 2026-06-26 board-unification unit (in git history, §A) simplified the round.';
  assert.deepEqual(findBadCitations(['docs/fake.md'], () => annotated), []);

  // The blind spot, asserted so it stays a known limit rather than a surprise:
  // no marker means no signal to key on, and the gate says nothing.
  const markerless = 'The 2026-07-30 ephemeral-working-specs unit violated it four times.';
  assert.deepEqual(findBadCitations(['docs/fake.md'], () => markerless), []);
});
