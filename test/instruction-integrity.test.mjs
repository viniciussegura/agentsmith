// Hard gates over the LIVE instruction set (not the pure functions, which
// bundles.test.js covers with synthetic inputs). These make three structural
// scorecard dimensions enforced/non-regressable:
//   - self-reference: no dangling #tag references
//   - lean-split: no core rule references a bundle-only #tag
//   - ownership: every defined #tag has exactly one resolvable owner
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownershipCoverage } from '../src/bundles.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

function walk(dir) {
  let out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

// self-reference + lean-split: the generator emits these as stderr warnings; a
// clean run means both hold.
test('generator emits no dangling-tag or cross-boundary warnings', () => {
  const r = spawnSync('node', ['bin/cli.js', '--stdout'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, `cli.js exited ${r.status}\n${r.stderr}`);
  const stderr = r.stderr || '';
  assert.ok(!/warning -- unresolved #tag references/.test(stderr), `self-reference gate (dangling tags):\n${stderr}`);
  assert.ok(!/warning -- core rule references a bundle-only/.test(stderr), `lean-split gate (cross-boundary):\n${stderr}`);
});

// ownership: every defined tag has exactly one resolvable owner.
test('ownership coverage is clean (no orphan / double-owned / unresolved owner)', () => {
  const texts = walk(join(ROOT, 'instructions')).map((p) => readFileSync(p, 'utf8'));
  const r = ownershipCoverage({
    instructionTexts: texts,
    ownershipText: readFileSync(join(ROOT, 'instructions/ownership.yaml'), 'utf8'),
    rolesText: readFileSync(join(ROOT, 'instructions/roles.yaml'), 'utf8'),
  });
  assert.deepEqual(r.orphans, [], `orphans: ${r.orphans.join(', ')}`);
  assert.deepEqual(r.doubleOwned, [], `double-owned: ${r.doubleOwned.join(', ')}`);
  assert.deepEqual(r.unresolvedOwners, [], `unresolved owners: ${JSON.stringify(r.unresolvedOwners)}`);
});
