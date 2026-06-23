import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { planToolInstall } from '../src/tools.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the generator never installs devtools/ into a consumer .claude', () => {
  const plan = planToolInstall([
    'devtools/triage-ui/server.mjs',
    'devtools/triage-ui/index.html',
    'tools/claude/skills/instruction-review/SKILL.md',
  ]);
  // only the tools/<ai>/ path is installed; nothing from devtools/
  assert.equal(plan.length, 1);
  assert.ok(plan[0].dest.startsWith('.claude/'));
  assert.ok(!plan.some((p) => p.src.startsWith('devtools/')));
});

test('planToolInstall never installs devtools/restructure/ into a consumer .claude', () => {
  const plan = planToolInstall([
    'devtools/restructure/some-script.mjs',
    'devtools/restructure/nested/helper.js',
    'tools/claude/skills/instruction-review/SKILL.md',
  ]);
  // only the tools/<ai>/ path is installed; nothing from devtools/restructure/
  assert.equal(plan.length, 1);
  assert.ok(plan[0].dest.startsWith('.claude/'));
  assert.ok(!plan.some((p) => p.src.startsWith('devtools/restructure/')));
});

test('npm pack does not publish devtools/', () => {
  const out = execSync('npm pack --dry-run --json', { cwd: ROOT, encoding: 'utf8' });
  const files = JSON.parse(out).flatMap((p) => p.files.map((f) => f.path));
  assert.ok(files.length > 0, 'npm pack listed files');
  assert.ok(!files.some((f) => f.replace(/\\/g, '/').startsWith('devtools/')),
    `devtools/ must not be packed; got: ${files.filter((f) => f.includes('devtools')).join(', ')}`);
  // explicit guard for devtools/restructure/
  assert.ok(!files.some((f) => f.replace(/\\/g, '/').startsWith('devtools/restructure/')),
    `devtools/restructure/ must not be packed; got: ${files.filter((f) => f.includes('devtools/restructure')).join(', ')}`);
});
