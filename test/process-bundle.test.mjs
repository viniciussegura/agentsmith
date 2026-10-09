// Hard gate over the lean split's process bundle: the seven process rules are defined in
// the generated process bundle and nowhere in the generated core, and the core's index
// points at the bundle. Built the way the generator builds (manifest sections, the real
// module lister, buildOutputs), so a module moved back by mistake fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOutputs } from '../src/build.js';
import { resolveSections } from '../src/sections.js';
import { makeListModules } from '../bin/cli.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const PROCESS_RULES = ['ai-plan', 'ai-plan-deviation', 'ai-preflight', 'ai-spec-review', 'swe-branch-lifespan', 'swe-epic', 'swe-consolidation-audit'];
const heading = (tag) => new RegExp(`^### #${tag} `, 'm');

function buildLive() {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
  const { coreModules, bundles } = resolveSections({ sections: manifest.sections, listModules: makeListModules(ROOT) });
  const texts = (mods) => mods.map(({ path, demote }) => ({ text: read(path), demote }));
  return buildOutputs({
    preamble: read(manifest.preamble),
    modules: texts(coreModules),
    bundles: bundles.map((b) => ({ name: b.name, title: b.title, when: b.when, modules: texts(b.modules) })),
    source: manifest.source,
    layout: 'lean',
  });
}

test('the seven process rules are defined in the process bundle and absent from the core', () => {
  const built = buildLive();
  const bundle = built.bundles.find((b) => b.path.endsWith('/process.md'));
  assert.ok(bundle, 'the process bundle is built');
  for (const tag of PROCESS_RULES) {
    assert.ok(!heading(tag).test(built.coreContent), `#${tag} is still defined in the core`);
    assert.ok(heading(tag).test(bundle.content), `#${tag} is not defined in the process bundle`);
  }
  assert.match(built.coreContent, /agents\/process\.md/, 'the on-demand index lists the bundle');
  assert.deepEqual(built.crossBoundary, [], 'no core rule cites a bundle-only tag bare');
  assert.deepEqual(built.unresolvedProse, [], 'every backticked reference in the core resolves');
  assert.deepEqual(built.dangling, []);
});
