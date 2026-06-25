import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

// Minimal per-line parse of roles.yaml (dependency-free, matches the repo's
// single-scalar config style): `  <name>: { ... spec_review: true|false ... }`.
function rolesWithSpecFlag() {
  const out = {};
  for (const line of read('instructions/roles.yaml').split('\n')) {
    const m = line.match(/^\s{2}(\w+):\s*\{(.+)\}\s*$/);
    if (!m) continue;
    const sr = m[2].match(/spec_review:\s*(true|false)/);
    out[m[1]] = sr ? sr[1] === 'true' : undefined;
  }
  return out;
}

test('every role row carries a boolean spec_review flag', () => {
  const roles = rolesWithSpecFlag();
  assert.ok(Object.keys(roles).length >= 8, 'parsed the role rows');
  for (const [name, v] of Object.entries(roles)) {
    assert.equal(typeof v, 'boolean', `role ${name} must declare spec_review (boolean)`);
  }
});

test('curated spec_review membership matches the spec', () => {
  const roles = rolesWithSpecFlag();
  const wantTrue = ['db', 'security', 'frontend', 'ux', 'qa', 'docs'];
  const wantFalse = ['swe', 'correctness', 'ai', 'git'];
  for (const r of wantTrue) assert.equal(roles[r], true, `${r} should participate in spec review`);
  for (const r of wantFalse) assert.equal(roles[r], false, `${r} should NOT participate (folded into generalist or meta-lens)`);
});

// --- reviewer-common third arm (Task 4) ---

test('reviewer-common.md Subject clause names a spec (third subject arm)', () => {
  const t = read('tools/claude/skills/review-board/reviewer-common.md');
  assert.match(t, /spec review/i, 'Subject/Schema must mention spec review');
});

test('reviewer-common.md Schema clause names Finding -> spec-review/finding-format.md', () => {
  const t = read('tools/claude/skills/review-board/reviewer-common.md');
  assert.match(t, /Finding/, 'names the Finding schema arm');
  assert.match(t, /spec-review\/finding-format\.md/, 'points at the spec-review finding format');
});

test('no review-<role> persona contains spec-specific text (artifact-neutral, no fork)', () => {
  const dir = join(root, 'tools/claude/agents');
  const personas = readdirSync(dir).filter((f) => /^review-.+\.md$/.test(f));
  assert.ok(personas.length > 0, 'found review-<role> personas');
  for (const f of personas) {
    const t = readFileSync(join(dir, f), 'utf8');
    assert.doesNotMatch(t, /spec[- ]review|spec auto-review|\bthe spec\b/i, `${f} must stay artifact-neutral`);
  }
});
