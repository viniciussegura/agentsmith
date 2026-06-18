import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOutputs } from '../src/build.js';
import { generate } from '../src/generate.js';

const base = {
  preamble: '# Agent instructions\n\nIntro.',
  modules: [{ text: '# Core\n\n## #core-x X', demote: 1 }],
  bundles: [
    { name: 'frontend', title: 'Front-end instructions', when: 'Front-end or UI work',
      modules: [{ text: '# Front\n\n## #front-y Y', demote: 1 }] },
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
    modules: [{ text: '# Core\n\n## #core-x X\n\nSee #core-ghost.', demote: 1 }],
    layout: 'lean',
    placement: 'nested',
  });
  assert.ok(out.dangling.includes('core-ghost'));
});

test('core references to bundle-only tags are surfaced as cross-boundary', () => {
  const out = buildOutputs({
    ...base,
    modules: [{ text: '# Core\n\n## #core-x X\n\nSee #front-y for the rest.', demote: 1 }],
    layout: 'lean',
    placement: 'nested',
  });
  assert.ok(out.crossBoundary.includes('front-y'), 'core leaning on a bundle tag is flagged');
  assert.ok(!out.dangling.includes('front-y'), 'the tag still resolves, so it is not dangling');
});

test('full layout has no cross-boundary refs since every module is inlined', () => {
  const out = buildOutputs({
    ...base,
    modules: [{ text: '# Core\n\n## #core-x X\n\nSee #front-y for the rest.', demote: 1 }],
    layout: 'full',
    placement: 'root',
    output: 'AGENTS.md',
  });
  assert.deepEqual(out.crossBoundary, [], 'no bundle files means nothing is bundle-only');
});

test('lean with no bundles emits no on-demand index and no bundle files', () => {
  const out = buildOutputs({ ...base, bundles: [], layout: 'lean', placement: 'nested' });
  assert.equal(out.bundles.length, 0);
  assert.doesNotMatch(out.coreContent, /#on-demand/);
  assert.doesNotMatch(out.coreContent, /On-demand instructions/);
});

test('out override sets corePath and suppresses the stub', () => {
  const out = buildOutputs({ ...base, layout: 'lean', placement: 'nested', out: 'custom/AGENTS.md' });
  assert.equal(out.corePath, 'custom/AGENTS.md');
  assert.equal(out.stub, null);
  assert.match(out.coreContent, /\.agentsmith\/agents\/frontend\.md/, 'bundle href still reaches .agentsmith');
});

test('multi-bundle lean lists every bundle href', () => {
  const out = buildOutputs({
    ...base,
    bundles: [
      { name: 'frontend', title: 'F', when: 'FE work', modules: [{ text: '# F\n\n## #f-a A', demote: 1 }] },
      { name: 'backend', title: 'B', when: 'BE work', modules: [{ text: '# B\n\n## #b-a A', demote: 1 }] },
    ],
    layout: 'lean',
    placement: 'nested',
  });
  assert.equal(out.bundles.length, 2);
  assert.match(out.coreContent, /agents\/frontend\.md/);
  assert.match(out.coreContent, /agents\/backend\.md/);
});

test('bundle title falls back to name when title is absent', () => {
  const out = buildOutputs({
    ...base,
    bundles: [{ name: 'frontend', when: 'FE work', modules: [{ text: '# F\n\n## #f-a A', demote: 1 }] }],
    layout: 'lean',
    placement: 'nested',
  });
  assert.match(out.bundles[0].content, /^# frontend$/m);
});

test('buildOutputs demotes core modules by their descriptor', () => {
  const out = buildOutputs({
    preamble: '# Root',
    modules: [{ text: '# G\n\nx', demote: 1 }, { text: '# #t T\n\ny', demote: 2 }],
    bundles: [],
    source: 's',
  });
  assert.match(out.coreContent, /^## G$/m);
  assert.match(out.coreContent, /^### #t T$/m);
});
