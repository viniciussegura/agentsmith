import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));

test('committed manifests are byte-equal to the generator output', () => {
  // build-plugin --stdout prints "<pluginJson>\n---\n<marketplaceJson>" without writing.
  const out = execFileSync('node', [join(root, 'bin/build-plugin.js'), '--stdout'], { encoding: 'utf8' });
  const [pluginGen, marketGen] = out.split('\n---\n');
  assert.equal(read('tools/claude/.claude-plugin/plugin.json'), pluginGen, 'plugin.json drifted — run npm run build:plugin');
  assert.equal(read('.claude-plugin/marketplace.json'), marketGen, 'marketplace.json drifted — run npm run build:plugin');
});

test('plugin.json mirrors package.json name/version/description and omits component lists', () => {
  const plugin = JSON.parse(read('tools/claude/.claude-plugin/plugin.json'));
  assert.equal(plugin.name, 'agentsmith');
  assert.equal(plugin.version, pkg.version);
  assert.equal(plugin.description, pkg.description);
  for (const k of ['commands', 'agents', 'skills']) assert.ok(!(k in plugin), `${k} must be auto-discovered, not enumerated`);
  assert.ok(plugin.hooks?.PreToolUse, 'declares the PreToolUse hook');
});

test('marketplace.json has owner + a git-subdir plugin source at tools/claude', () => {
  const m = JSON.parse(read('.claude-plugin/marketplace.json'));
  assert.ok(m.owner?.name, 'owner.name required');
  const entry = m.plugins.find((p) => p.name === 'agentsmith');
  assert.equal(entry.source.source, 'git-subdir');
  assert.equal(entry.source.path, 'tools/claude');
});
