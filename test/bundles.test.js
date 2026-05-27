import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onDemandIndex, danglingTags } from '../src/bundles.js';

test('onDemandIndex renders an h1, the tag, a MUST directive, and one bullet per entry', () => {
  const md = onDemandIndex([
    { when: 'Front-end or UI work', href: 'agents/frontend.md' },
  ]);

  assert.match(md, /^# On-demand instructions$/m, 'has an h1 so demotion lands it at h2');
  assert.match(md, /^## #on-demand /m, 'carries the #on-demand tag');
  assert.match(md, /\bMUST\b/, 'states the directive imperatively');
  assert.match(md, /- Front-end or UI work -> `agents\/frontend\.md`/, 'pairs when with href');
});

test('onDemandIndex renders one bullet per entry', () => {
  const md = onDemandIndex([
    { when: 'A work', href: 'agents/a.md' },
    { when: 'B work', href: 'agents/b.md' },
  ]);
  const bullets = md.split('\n').filter((l) => l.startsWith('- '));
  assert.equal(bullets.length, 2);
});

test('danglingTags reports a referenced tag that is defined nowhere', () => {
  const result = danglingTags({
    coreText: '## #swe-done Done\n\nSee #swe-missing for details.',
    bundleTexts: [],
  });
  assert.deepEqual(result, ['swe-missing']);
});

test('danglingTags resolves a tag defined in a bundle', () => {
  const result = danglingTags({
    coreText: 'Follow #front-a11y when building UI.',
    bundleTexts: ['## #front-a11y Accessibility\n\nTarget WCAG.'],
  });
  assert.deepEqual(result, []);
});

test('danglingTags ignores tokens inside fenced code blocks', () => {
  const result = danglingTags({
    coreText: '## #real Tag\n\n```\n#fake-tag should be ignored\n```',
    bundleTexts: [],
  });
  assert.deepEqual(result, []);
});

test('danglingTags ignores tag mentions inside inline backtick spans', () => {
  const result = danglingTags({
    coreText: 'The `#ui-*` glob and `#tag` placeholder are prose, not references.',
    bundleTexts: [],
  });
  assert.deepEqual(result, [], 'backtick-wrapped mentions are not real references');
});
