import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSections } from '../src/sections.js';

test('splits no-when sections into core and when sections into bundles', () => {
  const listFiles = (name) =>
    ({
      core: ['core/ai.md', 'core/code.md'],
      frontend: ['frontend/front.md', 'frontend/ui-guidelines.md'],
    })[name] || [];

  const { coreModulePaths, bundles } = resolveSections({
    sections: [
      { name: 'core' },
      { name: 'frontend', title: 'Front-end instructions', when: 'Front-end or UI work' },
    ],
    listFiles,
  });

  assert.deepEqual(coreModulePaths, ['core/ai.md', 'core/code.md']);
  assert.equal(bundles.length, 1);
  assert.deepEqual(bundles[0], {
    name: 'frontend',
    title: 'Front-end instructions',
    when: 'Front-end or UI work',
    modulePaths: ['frontend/front.md', 'frontend/ui-guidelines.md'],
  });
});

test('an explicit modules list overrides listFiles verbatim', () => {
  let called = false;
  const listFiles = () => {
    called = true;
    return ['SHOULD-NOT-BE-USED'];
  };

  const { coreModulePaths } = resolveSections({
    sections: [{ name: 'core', modules: ['core/swe.md', 'core/ai.md'] }],
    listFiles,
  });

  assert.deepEqual(coreModulePaths, ['core/swe.md', 'core/ai.md'], 'override used as given');
  assert.equal(called, false, 'listFiles is not consulted when modules is provided');
});

test('multiple no-when sections concatenate in section order', () => {
  const listFiles = (name) => ({ a: ['a1.md'], b: ['b1.md', 'b2.md'] })[name];

  const { coreModulePaths, bundles } = resolveSections({
    sections: [{ name: 'a' }, { name: 'b' }],
    listFiles,
  });

  assert.deepEqual(coreModulePaths, ['a1.md', 'b1.md', 'b2.md']);
  assert.deepEqual(bundles, []);
});

test('bundle order is preserved and title is optional', () => {
  const listFiles = (name) => [`${name}/x.md`];

  const { bundles } = resolveSections({
    sections: [
      { name: 'frontend', when: 'FE work' },
      { name: 'backend', when: 'BE work' },
    ],
    listFiles,
  });

  assert.deepEqual(
    bundles.map((b) => b.name),
    ['frontend', 'backend'],
  );
  assert.equal(bundles[0].title, undefined, 'title omitted; buildOutputs falls back to name');
});
