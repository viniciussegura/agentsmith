import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '../test-helpers/tmp-dir.mjs';
import {
  readLayoutConfig,
  parseLayoutTable,
  parseLayoutConfig,
  withRowPolicy,
  MAX_CONFIG_BYTES,
  ROW_POLICY,
  applyLayoutOverrides,
  deriveMappedPrefixes,
  mappedPrefixLint,
  MAPPED_PREFIX_EXCEPTIONS,
} from '../src/docslayout.js';
import { buildOutputs } from '../src/build.js';
import { resolveSections } from '../src/sections.js';
import { danglingTags, coreToBundleRefs } from '../src/bundles.js';
import { makeListModules } from '../bin/cli.js';

const repoRoot = resolve(fileURLToPath(import.meta.url), '../..');
const realModule = readFileSync(resolve(repoRoot, 'instructions/core/swe/swe-docs-layout.md'), 'utf8');

const HEADER = '| path | description | owner |\n| --- | --- | --- |';
const moduleWith = (...rows) => `# #swe-docs-layout Documentation layout\n\n${HEADER}\n${rows.join('\n')}\n`;
const row = (path, owner) => `| \`${path}\` | a description | ${owner} |`;

// Drives the rewrite over every row at once, so a dropped backtick, a shifted
// column or a reordered row fails here rather than only on the one row a
// single-override case happens to touch.
test('U1 rewriting every row to its own current path leaves the module byte-identical', () => {
  const rows = parseLayoutTable(realModule);
  assert.equal(rows.length, 5, 'the shipped table has five rows');
  const overrides = Object.fromEntries(rows.map((r) => [r.owner, { path: r.path }]));
  const expected = withoutBlock(realModule);
  assert.equal(applyLayoutOverrides({ moduleText: realModule, overrides }), expected);
});

test('U7 the shipped table parses with one bare owner tag per row and no shared owner', () => {
  const rows = parseLayoutTable(realModule);
  assert.ok(rows.length > 0);
  const owners = rows.map((r) => r.owner);
  for (const owner of owners) assert.match(owner, /^[a-z][a-z0-9-]*$/);
  assert.equal(new Set(owners).size, owners.length);
});

test('U7 every shipped table tag is classified in the per-row policy constant', () => {
  for (const { owner } of parseLayoutTable(realModule)) {
    assert.ok(Object.hasOwn(ROW_POLICY, owner), `${owner} has no ROW_POLICY entry`);
  }
});

test('ROW_POLICY carries the shipped eligibility and required placeholders', () => {
  assert.deepEqual(ROW_POLICY, {
    'swe-technical-debts': { external: true, placeholder: null },
    'swe-future-work': { external: true, placeholder: null },
    'swe-reference-spec': { external: false, placeholder: '<name>' },
    'swe-design-decisions': { external: false, placeholder: '<decision-slug>' },
    'swe-epic': { external: false, placeholder: null },
  });
});

test('parseLayoutTable throws naming the module when no table is present', () => {
  assert.throws(() => parseLayoutTable('# #swe-docs-layout Documentation layout\n\nno table\n'), /swe-docs-layout/);
});

test('parseLayoutTable throws naming the module when the header is not path/description/owner', () => {
  const text = '# x\n\n| a | b | c |\n| --- | --- | --- |\n| `p` | d | #swe-epic |\n';
  assert.throws(() => parseLayoutTable(text), /swe-docs-layout/);
});

test('parseLayoutTable throws naming the module when an owner cell is not exactly one bare tag', () => {
  for (const owner of ['swe-epic', '#swe-epic #swe-done', '`#swe-epic`', '#Swe-Epic', '']) {
    assert.throws(() => parseLayoutTable(moduleWith(row('docs/a/', owner))), /swe-docs-layout/, `owner "${owner}"`);
  }
});

test('parseLayoutTable throws naming the module when two rows share an owner', () => {
  const text = moduleWith(row('docs/a/', '#swe-epic'), row('docs/b/', '#swe-epic'));
  assert.throws(() => parseLayoutTable(text), /swe-docs-layout/);
});

test('parseLayoutTable throws naming the module when a path cell is not a code span', () => {
  assert.throws(() => parseLayoutTable(moduleWith('| docs/a/ | d | #swe-epic |')), /swe-docs-layout/);
});

test('parseLayoutTable accepts CRLF input and yields path, description, owner', () => {
  const text = moduleWith(row('docs/a/', '#swe-epic')).replace(/\n/g, '\r\n');
  assert.deepEqual(parseLayoutTable(text), [{ path: 'docs/a/', description: 'a description', owner: 'swe-epic' }]);
});

const SYNTHETIC = 'zqxjkv';
const FILE = 'docs-layout.yaml';
const knownRows = withRowPolicy(parseLayoutTable(realModule));
const lines = (...l) => l.join('\n');
const rowsWith = (tag, ...fieldLines) => lines('rows:', `  ${tag}:`, ...fieldLines.map((f) => `    ${f}`));
const parse = (text) => parseLayoutConfig(text, knownRows, FILE);

const assertRejected = (text, { line, includes }, label) => {
  let message;
  assert.throws(
    () => parse(text),
    (err) => {
      message = err.message;
      return true;
    },
    label,
  );
  assert.ok(message.startsWith(`${FILE}:${line}: `), `${label}: expected line ${line}, got "${message}"`);
  assert.ok(message.includes(includes), `${label}: "${message}" lacks "${includes}"`);
  assert.ok(message.includes('; '), `${label}: "${message}" lacks the allowed clause`);
  assert.ok(!message.includes(SYNTHETIC), `${label}: message echoes "${SYNTHETIC}": ${message}`);
};

const VALID_TAGS = knownRows.map((r) => `#${r.owner}`).join(', ');
const ELIGIBLE = '#swe-technical-debts and #swe-future-work';

test('U5 every malformed config shape is rejected with the exact line and a non-echoing message', () => {
  const cases = [
    ['unknown top-level key', lines('# c', 'rows:', `${SYNTHETIC}: x`), 3, 'unknown top-level key'],
    ['unknown tag', lines('rows:', `  ${SYNTHETIC}:`, '    path: docs/a/'), 2, `valid tags are ${VALID_TAGS}`],
    ['unknown field', rowsWith('swe-epic', `${SYNTHETIC}: x`), 3, 'unknown field'],
    ['both fields', rowsWith('swe-future-work', 'path: docs/a/', `external: ${SYNTHETIC}`), 4, 'both path and external'],
    ['neither field', lines('rows:', '  swe-epic:', '  swe-future-work:', '    path: docs/a/'), 2, 'neither path nor external'],
    ['neither field at end of file', lines('rows:', '', '  swe-epic:'), 3, 'neither path nor external'],
    ['duplicate row key', lines('rows:', '  swe-epic:', `    path: docs/${SYNTHETIC}/`, '  swe-epic:', '    path: docs/b/'), 4, 'duplicate row key'],
    ['duplicate field', rowsWith('swe-epic', `path: docs/${SYNTHETIC}/`, 'path: docs/b/'), 4, 'duplicate field'],
    ['duplicate rows key', lines('rows:', 'rows:'), 2, 'duplicate rows: key'],
    ['row key at 3 spaces', lines('rows:', '   swe-epic:'), 2, 'wrong indentation'],
    ['field at 5 spaces', lines('rows:', '  swe-epic:', `     path: docs/${SYNTHETIC}/`), 3, 'wrong indentation'],
    ['field at 2 spaces', lines('rows:', '  swe-epic:', `  path: docs/${SYNTHETIC}/`), 3, 'not a recognized entry'],
    ['field with no row', lines('rows:', `    path: docs/${SYNTHETIC}/`), 2, 'wrong indentation'],
    ['tab indent on a row key', lines('rows:', `\t${SYNTHETIC}:`), 2, 'tab'],
    ['tab indent on a field', lines('rows:', '  swe-epic:', `\t\tpath: docs/${SYNTHETIC}/`), 3, 'tab'],
    ['junk line at top level', lines('', `${SYNTHETIC} ${SYNTHETIC}`), 2, 'not a recognized entry'],
    ['junk row key with a value', lines('rows:', `  swe-epic: ${SYNTHETIC}`), 2, 'not a recognized entry'],
    ['junk field line', rowsWith('swe-epic', `- ${SYNTHETIC}`), 3, 'not a recognized entry'],
    ['value continued on a new line', lines('rows:', '  swe-epic:', '    path: docs/a/', SYNTHETIC), 4, 'not a recognized entry'],
    ['over-size file', '# padding\n'.repeat(Math.ceil(MAX_CONFIG_BYTES / 10) + 1), 1, 'larger than 64 KiB'],
    ...['swe-reference-spec', 'swe-epic', 'swe-design-decisions'].map((tag) => [
      `external on ineligible ${tag}`,
      rowsWith(tag, `external: ${SYNTHETIC}/ENG`),
      3,
      `eligible rows are ${ELIGIBLE}`,
    ]),
  ];
  for (const [label, text, line, includes] of cases) assertRejected(text, { line, includes }, label);
});

test('U5 the file name prefix is the caller-supplied name', () => {
  assert.throws(() => parseLayoutConfig('nope: 1', knownRows, 'custom.yaml'), /^Error: custom\.yaml:1: /);
});

test('U5 comments, blank lines anywhere, CRLF, lone CR, BOM, trailing whitespace and an empty rows: all parse', () => {
  const body = lines(
    '# header',
    '',
    'rows:',
    '  # between',
    '',
    '  swe-design-decisions:',
    '',
    '    # inside',
    '    path: docs/adr/<decision-slug>.md',
    '        # deeply indented comment',
    '  swe-technical-debts:',
    '    external: jira/ENG',
    '',
  );
  const expected = {
    'swe-design-decisions': { path: 'docs/adr/<decision-slug>.md' },
    'swe-technical-debts': { external: 'jira/ENG' },
  };
  assert.deepEqual(parse(body), expected);
  assert.deepEqual(parse(body.replace(/\n/g, '\r\n')), expected);
  assert.deepEqual(parse(body.replace(/\n/g, '\r')), expected);
  assert.deepEqual(parse(`\uFEFF${body}`), expected);
  assert.deepEqual(parse(body.replace('jira/ENG', 'jira/ENG   ').replace('<decision-slug>.md', '<decision-slug>.md \t')), expected);
  assert.deepEqual(parse('rows:\n'), {});
  assert.deepEqual(parse(''), {});
  assert.deepEqual(parse('# only a comment\n'), {});
});

test('U5 a file of exactly the size cap is accepted', () => {
  const line = `# ${'p'.repeat(5)}\n`;
  const text = line.repeat(MAX_CONFIG_BYTES / line.length);
  assert.equal(Buffer.byteLength(text), MAX_CONFIG_BYTES);
  assert.deepEqual(parse(text), {});
});

const pathCase = (tag, value) => parse(rowsWith(tag, `path: ${value}`));
const externalCase = (value) => parse(rowsWith('swe-technical-debts', `external: ${value}`));

test('U6 rejected path values', () => {
  const tag = 'swe-technical-debts';
  const rejected = [
    ['absolute path', `/${SYNTHETIC}/x`],
    ['windows drive', `C:/${SYNTHETIC}`],
    ['parent traversal', `docs/${SYNTHETIC}/../x`],
    ['leading parent traversal', `../${SYNTHETIC}`],
    ['dots inside a segment', `docs/${SYNTHETIC}..x`],
    ['backslash', `docs\\${SYNTHETIC}`],
    ['backtick', `docs/${SYNTHETIC}\`x`],
    ['pipe', `docs/${SYNTHETIC}|x`],
    ['asterisk', `docs/${SYNTHETIC}*`],
    ['whitespace', `docs/${SYNTHETIC} x`],
    ['hash', `docs/${SYNTHETIC}#x`],
    ['leading-dot segment', `.github/workflows/${SYNTHETIC}.yml`],
    ['nested leading-dot segment', `docs/.${SYNTHETIC}/`],
    ['node_modules segment', `docs/node_modules/${SYNTHETIC}`],
    ['unknown placeholder token', `docs/<${SYNTHETIC}>/`],
    ['case-variant placeholder token', `docs/<NAME>/${SYNTHETIC}`],
    ['dot-dot token', `docs/<..>/${SYNTHETIC}`],
    ['dot token', `docs/<.git>/${SYNTHETIC}`],
    ['unbalanced open bracket', `docs/<slug/${SYNTHETIC}`],
    ['unbalanced close bracket', `docs/slug>/${SYNTHETIC}`],
    ['over-length', `docs/${SYNTHETIC}${'a'.repeat(120)}`],
    ['empty segment', `docs//${SYNTHETIC}`],
    ['denylisted AGENTS.md', `${SYNTHETIC}/AGENTS.md`],
    ['denylisted CLAUDE.md', `${SYNTHETIC}/CLAUDE.md`],
    ['denylisted GEMINI.md', `${SYNTHETIC}/GEMINI.md`],
    ['denylisted package.json', `${SYNTHETIC}/package.json`],
    ['denylisted case variant', `${SYNTHETIC}/agents.md`],
    ['denylisted mixed case variant', `${SYNTHETIC}/Package.JSON`],
    ['denylisted at depth', `sub/${SYNTHETIC}/CLAUDE.md`],
  ];
  for (const [label, value] of rejected) {
    assert.throws(
      () => pathCase(tag, value),
      (err) => {
        assert.ok(err.message.startsWith(`${FILE}:3: `), `${label}: ${err.message}`);
        assert.ok(!err.message.includes(SYNTHETIC), `${label} echoes the marker: ${err.message}`);
        return true;
      },
      label,
    );
  }
  for (const bare of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'package.json', 'agents.md', 'sub/CLAUDE.md']) {
    assert.throws(() => pathCase(tag, bare), /^Error: docs-layout\.yaml:3: path names an instruction or manifest file; /, bare);
    assert.throws(() => pathCase(tag, bare), (err) => !err.message.includes(bare), `${bare} echoed`);
  }
});

test('U6 an empty path or external value is rejected', () => {
  assertRejected(rowsWith('swe-technical-debts', 'path:'), { line: 3, includes: 'path value is empty' }, 'empty path');
  assertRejected(rowsWith('swe-technical-debts', 'external:'), { line: 3, includes: 'external value is empty' }, 'empty external');
});

test('U6 a newline ends the value, so the continuation is rejected on its own line', () => {
  assertRejected(lines(rowsWith('swe-epic', 'path: docs/a/'), `${SYNTHETIC}/b`), { line: 4, includes: 'not a recognized entry' }, 'newline');
});

test('U6 rejected external labels', () => {
  const rejected = [
    ['space', `jira ${SYNTHETIC}`],
    ['hash', `jira/#${SYNTHETIC}`],
    ['backtick', `jira/${SYNTHETIC}\``],
    ['pipe', `jira/${SYNTHETIC}|x`],
    ['asterisk', `jira/${SYNTHETIC}*`],
    ['backslash', `jira\\${SYNTHETIC}`],
    ['leading slash', `/${SYNTHETIC}`],
    ['leading dot', `.${SYNTHETIC}`],
    ['angle bracket', `<${SYNTHETIC}>`],
    ['over 40 characters', `a${SYNTHETIC}${'b'.repeat(40)}`],
  ];
  for (const [label, value] of rejected) {
    assert.throws(
      () => externalCase(value),
      (err) => {
        assert.ok(err.message.startsWith(`${FILE}:3: external label is not valid; `), `${label}: ${err.message}`);
        assert.ok(!err.message.includes(SYNTHETIC), `${label} echoes the marker: ${err.message}`);
        return true;
      },
      label,
    );
  }
});

test('U6 a reference-spec or design-decisions path dropping its required placeholder is rejected', () => {
  assertRejected(rowsWith('swe-reference-spec', `path: docs/${SYNTHETIC}/`), { line: 3, includes: '<name>' }, 'reference-spec');
  assertRejected(rowsWith('swe-reference-spec', `path: docs/<slug>/${SYNTHETIC}.md`), { line: 3, includes: '<name>' }, 'reference-spec other token');
  assertRejected(rowsWith('swe-design-decisions', `path: docs/${SYNTHETIC}/`), { line: 3, includes: '<decision-slug>' }, 'design-decisions');
  assertRejected(rowsWith('swe-design-decisions', `path: docs/<name>/${SYNTHETIC}.md`), { line: 3, includes: '<decision-slug>' }, 'design-decisions other token');
});

test('U6 accepted path and external values', () => {
  for (const { owner, path } of parseLayoutTable(realModule)) {
    assert.deepEqual(parse(rowsWith(owner, `path: ${path}`)), { [owner]: { path } }, `shipped default for ${owner}`);
  }
  const maxPath = `docs/${'a'.repeat(115)}`;
  assert.equal(maxPath.length, 120);
  const accepted = [
    ['swe-design-decisions', 'docs/adr/<decision-slug>.md'],
    ['swe-epic', 'docs/epics/<slug>/'],
    ['swe-technical-debts', maxPath],
    ['swe-technical-debts', 'docs/debts/'],
    ['swe-technical-debts', 'docs/<YYYY-MM-DD>-<slug>.md'],
    ['swe-technical-debts', 'docs/AGENTS.md.notes/x.md'],
    ['swe-reference-spec', 'specs/reference/<name>.md'],
    ['swe-reference-spec', 'specs/<name>/README.md'],
  ];
  for (const [tag, path] of accepted) assert.deepEqual(pathCase(tag, path), { [tag]: { path } }, path);

  const label39 = `a${'b'.repeat(38)}`;
  const label40 = `a${'b'.repeat(39)}`;
  assert.equal(label39.length, 39);
  for (const label of ['jira/ENG', label39, label40, 'GH.issues/org_repo-1']) {
    assert.deepEqual(externalCase(label), { 'swe-technical-debts': { external: label } }, label);
  }
  assert.deepEqual(parse(rowsWith('swe-future-work', 'external: linear/TEAM')), { 'swe-future-work': { external: 'linear/TEAM' } });
});

test('U6 a table tag absent from the policy is ineligible for external and requires no placeholder', () => {
  const rows = withRowPolicy([...parseLayoutTable(realModule), { owner: 'swe-new-row' }]);
  assert.deepEqual(rows.at(-1), { owner: 'swe-new-row', external: false, placeholder: null });
  assert.throws(() => parseLayoutConfig(rowsWith('swe-new-row', 'external: jira/X'), rows, FILE), /:3: external is not allowed/);
  assert.deepEqual(parseLayoutConfig(rowsWith('swe-new-row', 'path: docs/new/'), rows, FILE), { 'swe-new-row': { path: 'docs/new/' } });
});

const CONFIG_DIR = '.agentsmith';
const CONFIG_NAME = 'docs-layout.yaml';
const CONFIG_TEXT = 'rows:\n  swe-epic:\n    path: docs/epics/<slug>/\n';
const identity = (p) => p;
const resolverMapping = (map) => (p) => (Object.hasOwn(map, p) ? map[p] : p);

const scopeWithConfig = (t, text) => {
  const base = makeTempDir(t, 'docslayout-');
  mkdirSync(join(base, CONFIG_DIR));
  const configPath = join(base, CONFIG_DIR, CONFIG_NAME);
  writeFileSync(configPath, text);
  return { base, configPath };
};

test('U10 a config path resolving inside the base is accepted and read', (t) => {
  const { base, configPath } = scopeWithConfig(t, CONFIG_TEXT);
  const read = readLayoutConfig({ base, resolve: resolverMapping({ [configPath]: join(base, CONFIG_DIR, CONFIG_NAME) }) });
  assert.equal(read.text, CONFIG_TEXT);
  assert.deepEqual(parse(read.text), { 'swe-epic': { path: 'docs/epics/<slug>/' } });
});

test('U10 the default resolver reads a real config inside the base', (t) => {
  const { base } = scopeWithConfig(t, CONFIG_TEXT);
  assert.equal(readLayoutConfig({ base }).text, CONFIG_TEXT);
});

test('U10 a config path resolving outside the base is refused, whether or not the target exists', (t) => {
  const { base, configPath } = scopeWithConfig(t, CONFIG_TEXT);
  const outside = makeTempDir(t, 'docslayout-outside-');
  writeFileSync(join(outside, 'secret.yaml'), `rows:\n${SYNTHETIC}\n`);
  for (const target of [join(outside, 'secret.yaml'), join(outside, 'missing.yaml'), resolve(base, '..', 'elsewhere.yaml')]) {
    assert.throws(
      () => readLayoutConfig({ base, resolve: resolverMapping({ [configPath]: target }) }),
      (err) => /swe-docs-layout: .*resolves outside the scope base; no output was generated/.test(err.message) && !err.message.includes(SYNTHETIC),
      target,
    );
  }
});

test('U10 a config path resolving to the base itself is refused', (t) => {
  const { base, configPath } = scopeWithConfig(t, CONFIG_TEXT);
  assert.throws(() => readLayoutConfig({ base, resolve: resolverMapping({ [configPath]: base }) }), /resolves outside the scope base/);
});

test('U10 a sibling directory sharing the base as a string prefix is refused', (t) => {
  const parent = makeTempDir(t, 'docslayout-');
  const base = join(parent, 'foo');
  const sibling = join(parent, 'foobar', CONFIG_NAME);
  assert.ok(sibling.startsWith(base), 'the sibling really does share the base as a string prefix');
  assert.throws(
    () => readLayoutConfig({ base, resolve: resolverMapping({ [join(base, CONFIG_DIR, CONFIG_NAME)]: sibling }) }),
    /resolves outside the scope base/,
  );
});

test('U10 the base is itself resolved, so a symlinked base does not make an inside path look outside', (t) => {
  const { base, configPath } = scopeWithConfig(t, CONFIG_TEXT);
  const realBase = join(base, 'real');
  mkdirSync(join(realBase, CONFIG_DIR), { recursive: true });
  const realConfig = join(realBase, CONFIG_DIR, CONFIG_NAME);
  writeFileSync(realConfig, CONFIG_TEXT);
  const resolve = resolverMapping({ [base]: realBase, [join(base, CONFIG_DIR, CONFIG_NAME)]: realConfig });
  assert.equal(readLayoutConfig({ base, resolve }).text, CONFIG_TEXT);
});

test('U10 a file over the size cap is refused and one of exactly the cap is read', (t) => {
  const over = scopeWithConfig(t, 'x'.repeat(MAX_CONFIG_BYTES + 1));
  assert.throws(() => readLayoutConfig({ base: over.base, resolve: identity }), /larger than 64 KiB; no output was generated/);
  const exact = scopeWithConfig(t, 'x'.repeat(MAX_CONFIG_BYTES));
  assert.equal(readLayoutConfig({ base: exact.base, resolve: identity }).text.length, MAX_CONFIG_BYTES);
});

test('U10 an absent config yields empty text that parses to no overrides, with no throw', (t) => {
  const base = makeTempDir(t, 'docslayout-');
  for (const resolver of [undefined, (p) => { throw Object.assign(new Error('gone'), { code: 'ENOENT' }); }]) {
    const read = readLayoutConfig({ base, ...(resolver && { resolve: resolver }) });
    assert.equal(read.text, '');
    assert.deepEqual(parse(read.text), {});
  }
});

test('U10 a present but unreadable config is refused rather than treated as absent', (t) => {
  const base = makeTempDir(t, 'docslayout-');
  mkdirSync(join(base, CONFIG_DIR, CONFIG_NAME), { recursive: true });
  assert.throws(() => readLayoutConfig({ base }), /present but cannot be read/);
  const denied = () => { throw Object.assign(new Error('nope'), { code: 'EACCES' }); };
  assert.throws(() => readLayoutConfig({ base, resolve: denied }), /cannot be resolved \(EACCES\); no output was generated/);
});

const OPEN_MARKER = '<!-- agentsmith:external-note -->';
const CLOSE_MARKER = '<!-- /agentsmith:external-note -->';

// Test-side, independent of src/docslayout.js: drop the blank line before the block and the block itself.
const withoutBlock = (text) => {
  const open = text.indexOf(OPEN_MARKER);
  const close = text.indexOf(CLOSE_MARKER) + CLOSE_MARKER.length + 1;
  assert.ok(open > 1 && close > open, 'the real module carries the note block');
  assert.equal(text.slice(open - 2, open), '\n\n', 'a blank line precedes the block');
  return text.slice(0, open - 1) + text.slice(close);
};
const noteText = (text) => text.slice(text.indexOf(OPEN_MARKER) + OPEN_MARKER.length + 1, text.indexOf(CLOSE_MARKER));
const tableLines = (text) => text.split('\n').filter((l) => l.startsWith('|'));

test('U2 a module not defining #swe-docs-layout is returned untouched, core or bundle hosted', () => {
  const overrides = { 'swe-epic': { path: 'work/<slug>/' } };
  const other = '# #swe-epic Epics\n\n| path | description | owner |\n| --- | --- | --- |\n| `docs/epics/<slug>/` | x | #swe-epic |\n';
  const withBlock = `# #ai-other Something\n\nmentions #swe-docs-layout\n\n${OPEN_MARKER}\nnote\n${CLOSE_MARKER}\n`;
  for (const moduleText of [other, withBlock, '', 'no heading at all\n']) {
    assert.equal(applyLayoutOverrides({ moduleText, overrides }), moduleText);
    assert.equal(applyLayoutOverrides({ moduleText, overrides: {} }), moduleText);
  }
});

test('U3 a relocation changes only the targeted row path cell', () => {
  const out = applyLayoutOverrides({
    moduleText: realModule,
    overrides: { 'swe-design-decisions': { path: 'docs/adr/<decision-slug>.md' } },
  });
  const before = tableLines(realModule);
  const after = tableLines(out);
  assert.equal(after.length, before.length);
  const target = parseLayoutTable(realModule).findIndex((r) => r.owner === 'swe-design-decisions') + 2;
  after.forEach((line, i) => {
    if (i === target) {
      assert.equal(line, '| `docs/adr/<decision-slug>.md` | the standing *why* behind cross-cutting choices | #swe-design-decisions |');
    } else {
      assert.equal(line, before[i]);
    }
  });
  assert.equal(out, withoutBlock(realModule).replace(before[target], after[target]));
});

test('U3 an override restating a default is a no-op', () => {
  const rows = parseLayoutTable(realModule);
  const overrides = Object.fromEntries(rows.map((r) => [r.owner, { path: r.path }]));
  assert.equal(applyLayoutOverrides({ moduleText: realModule, overrides }), withoutBlock(realModule));
});

test('U4 an external row renders as external -- `label` and the note appears exactly once below the table', () => {
  const out = applyLayoutOverrides({
    moduleText: realModule,
    overrides: { 'swe-technical-debts': { external: 'jira/ENG' } },
  });
  assert.ok(tableLines(out).includes('| external -- `jira/ENG` | open accepted shortcuts or known limitations | #swe-technical-debts |'));
  assert.ok(!out.includes(OPEN_MARKER) && !out.includes(CLOSE_MARKER));
  const note = noteText(realModule);
  assert.equal(out.split(note).length - 1, 1);
  assert.ok(out.indexOf(note) > out.lastIndexOf('#swe-epic |'));
  assert.ok(out.endsWith(`| #swe-epic |\n\n${note}`), 'blank line between table and note, markers gone');
});

test('U4 with only relocations or no overrides no trace of the block remains and the source is restored', () => {
  const expected = withoutBlock(realModule);
  assert.equal(applyLayoutOverrides({ moduleText: realModule, overrides: {} }), expected);
  assert.ok(expected.endsWith('| #swe-epic |\n'));
  const relocated = applyLayoutOverrides({ moduleText: realModule, overrides: { 'swe-epic': { path: 'work/<slug>/' } } });
  assert.ok(!relocated.includes('agentsmith:external-note'));
  assert.ok(!relocated.includes(noteText(realModule).trim().split('\n')[0]));
});

test('applyLayoutOverrides throws naming the module on table invariants and unknown tags', () => {
  const overrides = { 'swe-epic': { path: 'work/<slug>/' } };
  const dup = '# #swe-docs-layout X\n\n| path | description | owner |\n| --- | --- | --- |\n| `a/` | x | #swe-epic |\n| `b/` | y | #swe-epic |\n';
  const multi = dup.replace('| `b/` | y | #swe-epic |', '| `b/` | y | #swe-epic #swe-done |');
  assert.throws(() => applyLayoutOverrides({ moduleText: dup, overrides }), /#swe-docs-layout.*share the owner/);
  assert.throws(() => applyLayoutOverrides({ moduleText: multi, overrides }), /#swe-docs-layout.*bare #tag/);
  assert.throws(() => applyLayoutOverrides({ moduleText: '# #swe-docs-layout X\n\nno table\n', overrides }), /#swe-docs-layout/);
  assert.throws(() => applyLayoutOverrides({ moduleText: realModule, overrides: { nope: { path: 'a/' } } }), /#swe-docs-layout/);
});

const instructionsRoot = resolve(repoRoot, 'instructions');

const walkMarkdown = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walkMarkdown(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });

const instructionModules = () =>
  walkMarkdown(instructionsRoot).map((p) => ({
    path: relative(repoRoot, p).split('\\').join('/'),
    text: readFileSync(p, 'utf8'),
  }));

const MAP_MODULE_PATH = 'instructions/core/swe/swe-docs-layout.md';
// The property is that the line CITES the map, not that the citation carries a
// particular punctuation. Four sites sit inside an existing parenthetical, where
// `(#swe-docs-layout)` would nest parens in shipped rule prose, so a comma form
// is used there instead; both satisfy the tag scanner in src/bundles.js.
const CITATION = '#swe-docs-layout';

test('U8 the derived prefix set is the map\u2019s row directories and excludes bare docs/', () => {
  const prefixes = deriveMappedPrefixes(realModule);
  assert.deepEqual(prefixes, [
    'docs/design-decisions/',
    'docs/epics/',
    'docs/future-work/',
    'docs/reference-spec/',
    'docs/technical-debts/',
  ]);
  assert.ok(!prefixes.includes('docs/'), 'bare docs/ is not a mapped prefix');
  assert.deepEqual(deriveMappedPrefixes(parseLayoutTable(realModule)), prefixes, 'derivable from parsed rows too');
  // A pathless row and a row directly under the root both yield no prefix.
  assert.deepEqual(deriveMappedPrefixes([{ path: 'notes.md' }, { path: 'docs/<slug>.md' }]), []);
});

test('U8 the lint reports the module that restates a path the map owns', () => {
  const planted = [
    { path: 'instructions/core/swe/swe-planted.md', text: '# #swe-planted X\n\nRecorded in `docs/reference-spec/x.md`.\n' },
    { path: 'instructions/core/swe/swe-clean.md', text: `# #swe-clean X\n\nRecorded in the reference-spec directory ${CITATION}.\n` },
    { path: 'instructions/core/swe/swe-generic.md', text: '# #swe-generic X\n\nAny doc under `docs/` is in scope.\n' },
  ];
  assert.deepEqual(mappedPrefixLint(planted, deriveMappedPrefixes(realModule), []), [
    { path: 'instructions/core/swe/swe-planted.md', line: 3, prefix: 'docs/reference-spec/' },
  ]);
});

test('U8 the map module is exempt and a declared exception suppresses a hit', () => {
  const prefixes = deriveMappedPrefixes(realModule);
  const map = [{ path: MAP_MODULE_PATH, text: realModule }];
  assert.deepEqual(mappedPrefixLint(map, prefixes, []), [], 'the map owns the paths it lists');
  // Exemption follows the tag, not the path: the same text hosted elsewhere is still the map.
  assert.deepEqual(mappedPrefixLint([{ path: 'instructions/authoring/moved.md', text: realModule }], prefixes, []), []);

  const offender = [{ path: 'instructions/core/swe/swe-planted.md', text: '# #swe-planted X\n\nSee `docs/epics/x/`.\n' }];
  assert.equal(mappedPrefixLint(offender, prefixes, []).length, 1);
  assert.deepEqual(mappedPrefixLint(offender, prefixes, [['instructions/core/swe/swe-planted.md', 'docs/epics/x/']]), []);
});

test('U8 the shipped instruction tree restates no mapped path outside the map', () => {
  const hits = mappedPrefixLint(instructionModules(), deriveMappedPrefixes(realModule), MAPPED_PREFIX_EXCEPTIONS);
  const shown = hits.map((h) => `${h.path}:${h.line} restates ${h.prefix}`).join('\n');
  assert.deepEqual(hits, [], `cite ${CITATION} instead of a path the map owns:\n${shown}`);
});

test('U8 the declared-exception list is empty at ship', () => {
  assert.deepEqual(MAPPED_PREFIX_EXCEPTIONS, []);
});

// Each rewritten site: the path it used to restate, and the reference-spec
// document name it now cites by name (null where it names a directory or a
// record kind instead).
const REWRITTEN_SITES = [
  { path: 'instructions/core/swe/swe-entity.md', was: 'docs/reference-spec/', cites: 'entity-model' },
  { path: 'instructions/core/ai/ai-review-board.md', was: 'docs/reference-spec/', cites: 'review-board-protocol' },
  { path: 'instructions/core/ai/ai-review-engine.md', was: 'docs/reference-spec/', cites: 'review-board-protocol' },
  { path: 'instructions/core/ai/ai-spec-review.md', was: 'docs/reference-spec/', cites: 'review-board-protocol' },
  { path: 'instructions/authoring/ai-instruction-review.md', was: 'docs/reference-spec/', cites: 'review-board-protocol' },
  { path: 'instructions/core/ai/ai-session-hygiene.md', was: 'docs/design-decisions/', cites: null },
  { path: 'instructions/core/git/git-pr.md', was: 'docs/technical-debts/', cites: null },
  { path: 'instructions/core/ai/ai-multiple-requests.md', was: 'docs/future-work/', cites: null },
];

const referenceSpecPath = (name) => {
  const row = parseLayoutTable(realModule).find((r) => r.owner === 'swe-reference-spec');
  return resolve(repoRoot, row.path.replace('<name>', name));
};

test('U9 every rewritten site cites the map and no longer restates its old path', () => {
  for (const { path, was, cites } of REWRITTEN_SITES) {
    const lines = readFileSync(resolve(repoRoot, path), 'utf8').split('\n');
    const citing = lines.filter((line) => line.includes(CITATION));
    assert.ok(citing.length > 0, `${path} carries no ${CITATION} citation`);
    for (const [index, line] of lines.entries()) {
      assert.ok(!line.includes(was), `${path}:${index + 1} still restates ${was}`);
    }
    if (cites === null) continue;
    assert.ok(
      citing.some((line) => line.includes(`\`${cites}\``)),
      `${path} does not name the ${cites} document on its citing line`,
    );
  }
});

test('U9 every cited document name resolves under the default reference-spec directory', () => {
  for (const { cites } of REWRITTEN_SITES) {
    if (cites === null) continue;
    const file = referenceSpecPath(cites);
    assert.ok(existsSync(file), `${cites} does not resolve to ${file}`);
  }
});

const buildRemapped = (overrides, { extraCore = '' } = {}) => {
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, 'manifest.json'), 'utf8'));
  const read = (rel) => readFileSync(resolve(repoRoot, rel), 'utf8');
  const { coreModules, bundles } = resolveSections({
    sections: manifest.sections,
    listModules: makeListModules(repoRoot),
  });
  const remap = ({ path, demote }) => ({
    text: applyLayoutOverrides({ moduleText: read(path), overrides }) + (path.endsWith('swe-epic.md') ? extraCore : ''),
    demote,
  });
  return buildOutputs({
    preamble: read(manifest.preamble),
    modules: coreModules.map(remap),
    bundles: bundles.map((b) => ({ name: b.name, title: b.title, when: b.when, modules: b.modules.map(remap) })),
    source: manifest.source,
    layout: 'lean',
    placement: 'nested',
    output: manifest.output,
  });
};

const C8_OVERRIDES = {
  'swe-design-decisions': { path: 'docs/adr/<decision-slug>.md' },
  'swe-technical-debts': { external: 'jira/ENG' },
};

test('C8 a remapped set (relocation + external row) raises no dangling-tag and no core-to-bundle warning', () => {
  const built = buildRemapped(C8_OVERRIDES);
  assert.ok(built.coreContent.includes('external -- `jira/ENG`'), 'the external row and its note were injected');
  assert.ok(built.bundles.length > 0, 'bundle texts are present so the core-to-bundle lint has both sides');
  const bundleTexts = built.bundles.map((b) => b.content);
  assert.deepEqual(danglingTags({ coreText: built.coreContent, bundleTexts }), []);
  assert.deepEqual(coreToBundleRefs({ coreText: built.coreContent, bundleTexts }), []);
  assert.deepEqual(built.dangling, []);
  assert.deepEqual(built.crossBoundary, []);
});

test('C8 the lints can fail over this harness: a core reference to a bundle-only tag or an undefined tag is reported', () => {
  const built = buildRemapped(C8_OVERRIDES, { extraCore: '\nSee #be-api-first and #no-such-tag-xyz.\n' });
  const bundleTexts = built.bundles.map((b) => b.content);
  assert.deepEqual(danglingTags({ coreText: built.coreContent, bundleTexts }), ['no-such-tag-xyz']);
  assert.ok(coreToBundleRefs({ coreText: built.coreContent, bundleTexts }).some((c) => c.tag === 'be-api-first'));
});
