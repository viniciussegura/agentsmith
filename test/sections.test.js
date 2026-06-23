import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSections } from '../src/sections.js';

test('splits no-when sections into core and when sections into bundles', () => {
  const listModules = (name) =>
    ({
      core: [{ path: 'core/swe/_intro.md', demote: 1 }, { path: 'core/swe/swe-x.md', demote: 2 }],
      frontend: [{ path: 'frontend/front/_intro.md', demote: 1 }],
    })[name] || [];

  const { coreModules, bundles } = resolveSections({
    sections: [
      { name: 'core' },
      { name: 'frontend', title: 'Front-end instructions', when: 'Front-end or UI work' },
    ],
    listModules,
  });

  assert.deepEqual(coreModules, [
    { path: 'core/swe/_intro.md', demote: 1 },
    { path: 'core/swe/swe-x.md', demote: 2 },
  ]);
  assert.equal(bundles.length, 1);
  assert.deepEqual(bundles[0], {
    name: 'frontend',
    title: 'Front-end instructions',
    when: 'Front-end or UI work',
    modules: [{ path: 'frontend/front/_intro.md', demote: 1 }],
  });
});

test('an explicit modules list overrides listModules, demote from basename', () => {
  let called = false;
  const listModules = () => { called = true; return [{ path: 'X', demote: 9 }]; };
  const { coreModules } = resolveSections({
    sections: [{ name: 'core', modules: ['core/swe/_intro.md', 'core/swe/swe-a.md'] }],
    listModules,
  });
  assert.deepEqual(coreModules, [
    { path: 'core/swe/_intro.md', demote: 1 },
    { path: 'core/swe/swe-a.md', demote: 2 },
  ]);
  assert.equal(called, false);
});

test('multiple no-when sections concatenate in section order', () => {
  const listModules = (name) => ({ a: [{ path: 'a1.md', demote: 2 }], b: [{ path: 'b1.md', demote: 2 }, { path: 'b2.md', demote: 2 }] })[name];
  const { coreModules, bundles } = resolveSections({ sections: [{ name: 'a' }, { name: 'b' }], listModules });
  assert.deepEqual(coreModules, [{ path: 'a1.md', demote: 2 }, { path: 'b1.md', demote: 2 }, { path: 'b2.md', demote: 2 }]);
  assert.deepEqual(bundles, []);
});

test('bundle order is preserved and title is optional', () => {
  const listModules = (name) => [{ path: `${name}/x.md`, demote: 2 }];
  const { bundles } = resolveSections({
    sections: [{ name: 'frontend', when: 'FE work' }, { name: 'backend', when: 'BE work' }],
    listModules,
  });
  assert.deepEqual(bundles.map((b) => b.name), ['frontend', 'backend']);
  assert.equal(bundles[0].title, undefined);
});
