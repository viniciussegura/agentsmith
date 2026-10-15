import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  onDemandIndex,
  danglingTags,
  coreToBundleRefs,
  unresolvedProseRefs,
  parseOwnership,
  parseRoles,
  ownershipCoverage,
} from '../src/bundles.js';

const repoRoot = resolve(fileURLToPath(import.meta.url), '../..');

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

test('coreToBundleRefs flags a core reference to a bundle-only tag', () => {
  const result = coreToBundleRefs({
    coreText: '## #swe-x X\n\nSee #front-a11y for UI rules.',
    bundleTexts: ['## #front-a11y Accessibility\n\nTarget WCAG.'],
  });
  assert.deepEqual(result, [{ tag: 'front-a11y', from: 'swe-x' }], 'core cannot rely on a tag only the bundle defines; names the rule that raised it');
});

test('coreToBundleRefs does not flag bundle-to-core references', () => {
  const result = coreToBundleRefs({
    coreText: '## #swe-display-messages Messages\n\nWrite for the reader.',
    bundleTexts: ['## #ui-states States\n\nFollow #swe-display-messages.'],
  });
  assert.deepEqual(result, [], 'a bundle may safely reference a core tag');
});

test('coreToBundleRefs does not flag a core-defined tag', () => {
  const result = coreToBundleRefs({
    coreText: '## #swe-done Done\n\nSee #swe-done item 1.',
    bundleTexts: ['## #front-a11y Accessibility'],
  });
  assert.deepEqual(result, [], 'core referencing its own tag is fine');
});

test('coreToBundleRefs ignores a tag defined nowhere (that is danglingTags job)', () => {
  const result = coreToBundleRefs({
    coreText: '## #swe-x X\n\nSee #swe-ghost.',
    bundleTexts: ['## #front-a11y Accessibility'],
  });
  assert.deepEqual(result, [], 'a wholly undefined tag is not a cross-boundary case');
});

// The layout map's owner column registers a record type under its rule tag; the parser
// requires the bare tag and consumer configs key on it, so that one cell shape is exempt
// from the lean-split gate. Everything else stays reported.
const EPIC_BUNDLE = '## #swe-epic Epics\n\nAn epic.';
const layoutMap = (cell) =>
  `## #swe-docs-layout Layout\n\n| path | description | owner |\n| --- | --- | --- |\n| \`docs/epics/<slug>/\` | an initiative | ${cell} |\n`;

test('coreToBundleRefs exempts a sole-tag cell of the layout map and nothing else', () => {
  const refs = (coreText) => coreToBundleRefs({ coreText, bundleTexts: [EPIC_BUNDLE] });
  assert.deepEqual(refs(layoutMap('#swe-epic')), [], 'the owner cell is a registration');
  assert.deepEqual(refs(layoutMap('#swe-epic owner')), [{ tag: 'swe-epic', from: 'swe-docs-layout' }], 'a tag plus words is a citation');
  assert.deepEqual(refs(layoutMap('#swe-epic #swe-epic')), [{ tag: 'swe-epic', from: 'swe-docs-layout' }], 'two tags in one cell are citations');
  assert.deepEqual(refs(`${layoutMap('-')}\nAn epic is planned per #swe-epic.\n`), [{ tag: 'swe-epic', from: 'swe-docs-layout' }], 'the same tag in a paragraph is a citation');
  const otherTable = '## #swe-other Other\n\n| a | owner |\n| --- | --- |\n| x | #swe-epic |\n';
  assert.deepEqual(refs(otherTable), [{ tag: 'swe-epic', from: 'swe-other' }], 'a sole-tag cell in another rule is a citation, and the report names that rule');
});

test('unresolvedProseRefs resolves backticked references and ignores placeholders and globs', () => {
  const bundleTexts = ['## #swe-epic Epics'];
  assert.deepEqual(unresolvedProseRefs({ coreText: '## #swe-x X\n\nSee `#swe-epic` (process bundle) and `#swe-x`.', bundleTexts }), []);
  assert.deepEqual(unresolvedProseRefs({ coreText: '## #swe-x X\n\nSee `#swe-epix` (process bundle).', bundleTexts }), ['swe-epix']);
  assert.deepEqual(unresolvedProseRefs({ coreText: '## #swe-x X\n\nEach rule carries a `#tag`; cite the `#token` by name; `#ui-*` is a glob.', bundleTexts }), []);
  assert.deepEqual(unresolvedProseRefs({ coreText: '## #swe-x X\n\n```text\n`#swe-nope`\n```\n', bundleTexts }), [], 'fenced text is not prose');
});

test('parseOwnership reads rows in order and preserves duplicate keys', () => {
  const rows = parseOwnership(
    'owners:\n  swe-naming: swe\n  swe-entity: db\n  swe-naming: ux\n',
  );
  assert.deepEqual(rows, [
    { tag: 'swe-naming', owner: 'swe' },
    { tag: 'swe-entity', owner: 'db' },
    { tag: 'swe-naming', owner: 'ux' },
  ]);
});

test('parseRoles reads role ids and markers', () => {
  const { roles, markers } = parseRoles(
    'roles:\n  swe: { always: true }\n  ux: { always: false }\nmarkers:\n  - process\n',
  );
  assert.deepEqual(roles, ['swe', 'ux']);
  assert.deepEqual(markers, ['process']);
});

const rolesFixture = 'roles:\n  swe: {}\n  db: {}\nmarkers:\n  - process\n';

test('ownershipCoverage is clean when every defined tag has one resolvable owner', () => {
  const result = ownershipCoverage({
    instructionTexts: ['## #swe-naming N', '## #swe-entity E', '## #git-title T'],
    ownershipText: 'owners:\n  swe-naming: swe\n  swe-entity: db\n  git-title: process\n',
    rolesText: rolesFixture,
  });
  assert.deepEqual(result.orphans, []);
  assert.deepEqual(result.doubleOwned, []);
  assert.deepEqual(result.unresolvedOwners, []);
});

test('ownershipCoverage reports an orphan tag (defined, unowned)', () => {
  const result = ownershipCoverage({
    instructionTexts: ['## #swe-naming N', '## #swe-orphan O'],
    ownershipText: 'owners:\n  swe-naming: swe\n',
    rolesText: rolesFixture,
  });
  assert.deepEqual(result.orphans, ['swe-orphan']);
});

test('ownershipCoverage reports a double-owned tag (duplicate row)', () => {
  const result = ownershipCoverage({
    instructionTexts: ['## #swe-naming N'],
    ownershipText: 'owners:\n  swe-naming: swe\n  swe-naming: db\n',
    rolesText: rolesFixture,
  });
  assert.deepEqual(result.doubleOwned, ['swe-naming']);
});

test('ownershipCoverage reports an owner that resolves to no role or marker', () => {
  const result = ownershipCoverage({
    instructionTexts: ['## #swe-naming N'],
    ownershipText: 'owners:\n  swe-naming: nobody\n',
    rolesText: rolesFixture,
  });
  assert.deepEqual(result.unresolvedOwners, [{ tag: 'swe-naming', owner: 'nobody' }]);
});

test('ownershipCoverage accepts the non-review marker as a resolvable owner', () => {
  const result = ownershipCoverage({
    instructionTexts: ['## #ai-candid C', '## #git-title T'],
    ownershipText: 'owners:\n  ai-candid: process\n  git-title: process\n',
    rolesText: rolesFixture,
  });
  assert.deepEqual(result.unresolvedOwners, []);
  assert.deepEqual(result.orphans, []);
});

// Read every instruction .md (recursively), plus the two config files.
function instructionTexts() {
  const dir = join(repoRoot, 'instructions');
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const abs = join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else if (extname(e.name) === '.md') out.push(readFileSync(abs, 'utf8'));
    }
  };
  walk(dir);
  return out;
}

test('CI gate: the real instruction set has exactly one resolvable owner per tag', () => {
  const result = ownershipCoverage({
    instructionTexts: instructionTexts(),
    ownershipText: readFileSync(join(repoRoot, 'instructions/ownership.yaml'), 'utf8'),
    rolesText: readFileSync(join(repoRoot, 'instructions/roles.yaml'), 'utf8'),
  });
  assert.deepEqual(result.orphans, [], 'every defined #tag must have an ownership row');
  assert.deepEqual(result.doubleOwned, [], 'no tag may be owned twice');
  assert.deepEqual(result.unresolvedOwners, [], 'every owner must resolve to a role or marker');
  assert.deepEqual(result.stale, [], 'no ownership row may name a tag defined nowhere');
  assert.deepEqual(result.rolesWithoutTags, [], 'every non-correctness role should own at least one tag');
});
