import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOutputs } from '../src/build.js';
import { generate } from '../src/generate.js';

const base = {
  preamble: '# Agent instructions\n\nIntro.',
  modules: ['# Core\n\n## #core-x X'],
  bundles: [
    { name: 'frontend', title: 'Front-end instructions', when: 'Front-end or UI work',
      modules: ['# Front\n\n## #front-y Y'] },
  ],
  source: 's',
};

test('lean + nested: core goes under .agentsmith, bundle path and href resolve', () => {
  const out = buildOutputs({ ...base, layout: 'lean', placement: 'nested' });

  assert.equal(out.corePath, '.agentsmith/AGENTS.md');
  assert.equal(out.bundles.length, 1);
  assert.equal(out.bundles[0].path, '.agentsmith/agents/frontend.md');
  assert.match(out.coreContent, /agents\/frontend\.md/, 'href is relative to .agentsmith');
  assert.doesNotMatch(out.coreContent, /agentsmith\/agents/, 'href is not doubled under nesting');
  assert.match(out.coreContent, /#core-x/, 'core module is inlined');
  assert.doesNotMatch(out.coreContent, /#front-y/, 'bundle module is NOT inlined in lean core');
});

test('lean + root: core at AGENTS.md, href points into .agentsmith', () => {
  const out = buildOutputs({ ...base, layout: 'lean', placement: 'root', output: 'AGENTS.md' });

  assert.equal(out.corePath, 'AGENTS.md');
  assert.match(out.coreContent, /`\.agentsmith\/agents\/frontend\.md`/, 'href is root-relative');
});

test('full: monolith inlines every module, no bundle files, no index', () => {
  const out = buildOutputs({ ...base, layout: 'full', placement: 'root', output: 'AGENTS.md' });

  assert.equal(out.bundles.length, 0);
  assert.match(out.coreContent, /#core-x/);
  assert.match(out.coreContent, /#front-y/, 'bundle module inlined in full');
  assert.doesNotMatch(out.coreContent, /#on-demand/, 'no on-demand index in full');
});

test('full + root reproduces a plain generate() over all modules in order', () => {
  const out = buildOutputs({ ...base, layout: 'full', placement: 'root', output: 'AGENTS.md' });
  const expected = generate({
    preamble: base.preamble,
    modules: [...base.modules, ...base.bundles.flatMap((b) => b.modules)],
    source: base.source,
  });
  assert.equal(out.coreContent, expected);
});

test('bundle file has a single h1 from its title and demoted member headings', () => {
  const out = buildOutputs({ ...base, layout: 'lean', placement: 'nested' });
  const bundle = out.bundles[0].content;

  const h1s = bundle.split('\n').filter((l) => /^# /.test(l));
  assert.equal(h1s.length, 1, 'exactly one h1');
  assert.match(bundle, /^# Front-end instructions$/m, 'h1 is the bundle title');
  assert.match(bundle, /^## Front$/m, 'member h1 demoted to h2');
});

test('stub is planned when nested, omitted when root', () => {
  const nested = buildOutputs({ ...base, layout: 'lean', placement: 'nested' });
  assert.equal(nested.stub.path, 'AGENTS.md');
  assert.match(nested.stub.content, /\.agentsmith\/AGENTS\.md/);

  const root = buildOutputs({ ...base, layout: 'lean', placement: 'root', output: 'AGENTS.md' });
  assert.equal(root.stub, null);
});

test('dangling tag references are surfaced', () => {
  const out = buildOutputs({
    ...base,
    modules: ['# Core\n\n## #core-x X\n\nSee #core-ghost.'],
    layout: 'lean',
    placement: 'nested',
  });
  assert.ok(out.dangling.includes('core-ghost'));
});
