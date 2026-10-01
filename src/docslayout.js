// Project-dependent rule content: see the design decision `project-dependent-rule-content`.

import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

const MODULE_NAME = '#swe-docs-layout';
const TABLE_HEADER = ['path', 'description', 'owner'];
const BARE_OWNER_TAG = /^#([a-z][a-z0-9-]*)$/;
const CODE_SPAN = /^`([^`]+)`$/;
const SEPARATOR_CELL = /^-+$/;

/**
 * Per-row policy for the `#swe-docs-layout` rows, keyed by bare owner tag.
 * The table has only path/description/owner columns, so neither field is
 * inferable from it. A tag absent here is ineligible for `external` and
 * requires no placeholder.
 *
 * @type {Record<string, { external: boolean, placeholder: string | null }>}
 */
export const ROW_POLICY = {
  'swe-technical-debts': { external: true, placeholder: null },
  'swe-future-work': { external: true, placeholder: null },
  'swe-reference-spec': { external: false, placeholder: '<name>' },
  'swe-design-decisions': { external: false, placeholder: '<decision-slug>' },
  'swe-epic': { external: false, placeholder: null },
};

const fail = (why) => new Error(`${MODULE_NAME}: ${why}`);

const cells = (line) =>
  line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

/**
 * Parse the table in the `#swe-docs-layout` rule module.
 * Throws, naming the module, when the table is missing or malformed, an owner
 * cell is not exactly one bare `#tag`, or two rows share an owner.
 *
 * @param {string} moduleText
 * @returns {{ path: string, description: string, owner: string }[]} Rows in source order; `owner` is the bare tag.
 */
export function parseLayoutTable(moduleText) {
  const lines = moduleText.split(/\r?\n/).filter((line) => line.startsWith('|'));
  if (lines.length < 3) throw fail('no table with a header, separator and at least one row');

  const [header, separator, ...body] = lines.map(cells);
  if (header.join('\n') !== TABLE_HEADER.join('\n')) {
    throw fail(`table header must be ${TABLE_HEADER.join(' | ')}`);
  }
  if (separator.length !== TABLE_HEADER.length || !separator.every((c) => SEPARATOR_CELL.test(c))) {
    throw fail('table separator row is malformed');
  }

  const seen = new Set();
  return body.map((row) => {
    if (row.length !== TABLE_HEADER.length) throw fail('a table row does not have exactly three cells');
    const [pathCell, description, ownerCell] = row;
    const path = CODE_SPAN.exec(pathCell)?.[1];
    if (path === undefined) throw fail('a path cell must be a single code span');
    const owner = BARE_OWNER_TAG.exec(ownerCell)?.[1];
    if (owner === undefined) throw fail('an owner cell must be exactly one bare #tag');
    if (seen.has(owner)) throw fail(`two rows share the owner #${owner}`);
    seen.add(owner);
    return { path, description, owner };
  });
}

export const MAX_CONFIG_BYTES = 64 * 1024;
const MAX_PATH_LENGTH = 120;
const PLACEHOLDER_TOKENS = ['<name>', '<slug>', '<decision-slug>', '<YYYY-MM-DD>'];
const PLACEHOLDER_SUBSTITUTE = '0';
const LITERAL_PATH = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*\/?$/;
const EXTERNAL_LABEL = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/;
const FORBIDDEN_SEGMENT = 'node_modules';
const PROTECTED_BASENAMES = new Set(['agents.md', 'claude.md', 'gemini.md', 'package.json']);
const ROWS_KEY = 'rows:';
const TOP_LEVEL_KEY = /^[A-Za-z_][\w-]*:/;
const ROW_KEY = /^([a-z][a-z0-9-]*):$/;
const FIELD_LINE = /^([a-z]+):(?: +(.*))?$/;
const ROW_INDENT = 2;
const FIELD_INDENT = 4;
const INDENT_RULE = 'rows: at column 0, a row key at exactly 2 spaces, a field at exactly 4 spaces';
const JUNK_ALLOWED = 'allowed are rows:, a row key, a path or external field, blank lines and # comments';

/**
 * Merge the parsed table with `ROW_POLICY`, deny-by-default: a tag absent from
 * the policy is ineligible for `external` and requires no placeholder.
 *
 * @param {{ owner: string }[]} tableRows Output of `parseLayoutTable`.
 * @returns {{ owner: string, external: boolean, placeholder: string | null }[]}
 */
export function withRowPolicy(tableRows) {
  return tableRows.map(({ owner }) => {
    const policy = Object.hasOwn(ROW_POLICY, owner) ? ROW_POLICY[owner] : undefined;
    return { owner, external: policy?.external === true, placeholder: policy?.placeholder ?? null };
  });
}

const CONFIG_RELATIVE_PATH = join('.agentsmith', 'docs-layout.yaml');
const PARENT_SEGMENT = '..';

/** True when `target` is strictly inside `base`: not the base itself, not a string-prefix sibling. */
const isStrictlyInside = (base, target) => {
  const rel = relative(base, target);
  return rel !== '' && !isAbsolute(rel) && rel.split(sep)[0] !== PARENT_SEGMENT;
};

/**
 * Read `<base>/.agentsmith/docs-layout.yaml` without following a symlink out of `base`.
 * The resolved config path must lie strictly inside the resolved base; the base itself is refused.
 * Throws when the path resolves outside the base, the file is present but unreadable, or it exceeds
 * `MAX_CONFIG_BYTES`. A file that is simply absent yields empty text, which parses to no overrides.
 *
 * @param {{ base: string, resolve?: (path: string) => string }} options
 *   `resolve` is the path resolver (default `fs.realpathSync`); it throws `ENOENT` for an absent path.
 * @returns {{ file: string, text: string }} The config's base name and its text; `text` is `''` when absent.
 */
export function readLayoutConfig({ base, resolve = realpathSync }) {
  const configPath = join(base, CONFIG_RELATIVE_PATH);
  const file = CONFIG_RELATIVE_PATH.replaceAll(sep, '/');
  let resolved;
  try {
    resolved = resolve(configPath);
  } catch (err) {
    if (err?.code === 'ENOENT') return { file, text: '' };
    throw fail(`${file} cannot be resolved (${err?.code ?? 'unknown error'}); no output was generated`);
  }
  let realBase;
  try {
    realBase = resolve(base);
  } catch (err) {
    throw fail(`the scope base cannot be resolved (${err?.code ?? 'unknown error'}); no output was generated`);
  }
  if (!isStrictlyInside(realBase, resolved)) {
    throw fail(`${file} resolves outside the scope base; no output was generated`);
  }
  try {
    if (statSync(resolved).size > MAX_CONFIG_BYTES) {
      throw fail(`${file} is larger than ${MAX_CONFIG_BYTES / 1024} KiB; no output was generated`);
    }
    return { file, text: readFileSync(resolved, 'utf8') };
  } catch (err) {
    if (err?.message?.startsWith(MODULE_NAME)) throw err;
    throw fail(`${file} is present but cannot be read (${err?.code ?? 'unknown error'}); no output was generated`);
  }
}

/** @returns {[string, string] | null} [what is wrong, what is allowed], or null when valid. */
const pathProblem = (value, placeholder) => {
  if (value.length > MAX_PATH_LENGTH) {
    return [`path is longer than ${MAX_PATH_LENGTH} characters`, 'use a shorter repo-relative path'];
  }
  const substituted = PLACEHOLDER_TOKENS.reduce((acc, token) => acc.replaceAll(token, PLACEHOLDER_SUBSTITUTE), value);
  if (/[<>]/.test(substituted)) {
    return ['path has a malformed or unknown placeholder', `only ${PLACEHOLDER_TOKENS.join(', ')} are allowed`];
  }
  if (!LITERAL_PATH.test(substituted) || substituted.includes('..') || substituted.split('/').includes(FORBIDDEN_SEGMENT)) {
    return [
      'path is not a safe repo-relative path',
      'use segments of letters, digits, dot, underscore and hyphen, each starting with a letter or digit, with no .. and no node_modules',
    ];
  }
  const basename = substituted.split('/').filter(Boolean).at(-1).toLowerCase();
  if (PROTECTED_BASENAMES.has(basename)) {
    return ['path names an instruction or manifest file', 'those files cannot be a remap target'];
  }
  if (placeholder !== null && !value.includes(placeholder)) {
    return [`path drops the ${placeholder} placeholder this row requires`, `keep ${placeholder} in the new path`];
  }
  return null;
};

/** @returns {[string, string] | null} */
const externalProblem = (value) =>
  EXTERNAL_LABEL.test(value)
    ? null
    : [
        'external label is not valid',
        'use 1 to 40 characters of letters, digits, dot, underscore, slash and hyphen, starting with a letter or digit, with no spaces',
      ];

/**
 * Parse `.agentsmith/docs-layout.yaml` with deny-by-default rules.
 * Every error message is `<file>:<line>: <what is wrong>; <what is allowed>` and
 * reveals no byte of the offending value or line. This function owns the file
 * name prefix: the caller supplies it as `file`.
 *
 * @param {string} text
 * @param {{ owner: string, external?: boolean, placeholder?: string | null }[]} knownRows Output of `withRowPolicy`.
 * @param {string} [file] Name shown in error messages.
 * @returns {Record<string, { path: string } | { external: string }>} Overrides keyed by bare owner tag.
 */
export function parseLayoutConfig(text, knownRows, file = 'docs-layout.yaml') {
  const error = (line, why, allowed) => new Error(`${file}:${line}: ${why}; ${allowed}`);
  const junk = (line) => error(line, 'line is not a recognized entry', JUNK_ALLOWED);
  if (Buffer.byteLength(text) > MAX_CONFIG_BYTES) {
    throw error(1, `file is larger than ${MAX_CONFIG_BYTES / 1024} KiB`, 'keep the config under 64 KiB');
  }

  const known = new Map(knownRows.map((r) => [r.owner, r]));
  const validTags = knownRows.map((r) => `#${r.owner}`).join(', ');
  const eligible = knownRows
    .filter((r) => r.external === true)
    .map((r) => `#${r.owner}`)
    .join(' and ');

  const lines = text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''));

  const overrides = {};
  const seenTags = new Set();
  let sawRows = false;
  let current = null;

  const closeRow = () => {
    if (current === null) return;
    if (current.override === null) {
      throw error(current.line, 'row declares neither path nor external', 'declare exactly one of path or external');
    }
    overrides[current.tag] = current.override;
    current = null;
  };

  lines.forEach((raw, index) => {
    const lineNo = index + 1;
    if (raw === '' || /^\s*#/.test(raw)) return;

    const leading = /^[ \t]*/.exec(raw)[0];
    if (leading.includes('\t')) throw error(lineNo, 'indentation uses a tab', `use spaces: ${INDENT_RULE}`);
    const indent = leading.length;
    const content = raw.slice(indent);

    if (indent === 0) {
      closeRow();
      if (content === ROWS_KEY) {
        if (sawRows) throw error(lineNo, 'duplicate rows: key', 'rows: may appear once');
        sawRows = true;
        return;
      }
      if (TOP_LEVEL_KEY.test(content)) throw error(lineNo, 'unknown top-level key', 'only rows: is allowed');
      throw junk(lineNo);
    }

    if (indent === ROW_INDENT) {
      const tag = ROW_KEY.exec(content)?.[1];
      if (tag === undefined) throw junk(lineNo);
      if (!sawRows) throw error(lineNo, 'row key before rows:', INDENT_RULE);
      closeRow();
      const policy = known.get(tag);
      if (policy === undefined) throw error(lineNo, 'unknown row tag', `valid tags are ${validTags}`);
      if (seenTags.has(tag)) throw error(lineNo, 'duplicate row key', 'each tag may appear once');
      seenTags.add(tag);
      current = { tag, line: lineNo, policy, override: null };
      return;
    }

    if (indent === FIELD_INDENT && current !== null) {
      const match = FIELD_LINE.exec(content);
      if (match === null) throw junk(lineNo);
      const [, field, value = ''] = match;
      if (field !== 'path' && field !== 'external') {
        throw error(lineNo, 'unknown field', 'allowed fields are path and external');
      }
      if (current.override !== null) {
        const same = Object.hasOwn(current.override, field);
        throw same
          ? error(lineNo, 'duplicate field', 'each field may appear once per row')
          : error(lineNo, 'row declares both path and external', 'declare exactly one of path or external');
      }
      if (field === 'external' && current.policy.external !== true) {
        throw error(lineNo, 'external is not allowed for this row', `eligible rows are ${eligible}`);
      }
      if (value === '') throw error(lineNo, `${field} value is empty`, `give ${field} a value`);
      const problem = field === 'path' ? pathProblem(value, current.policy.placeholder ?? null) : externalProblem(value);
      if (problem !== null) throw error(lineNo, ...problem);
      current.override = { [field]: value };
      return;
    }

    throw error(lineNo, 'wrong indentation', INDENT_RULE);
  });
  closeRow();

  return overrides;
}

// Strip: the blank line before the block, then the open marker line through the close marker line.
const NOTE_BLOCK = /\r?\n<!-- agentsmith:external-note -->[^\n]*\n[\s\S]*?<!-- \/agentsmith:external-note -->(?:\r?\n|$)/;
const NOTE_OPEN_LINE = /<!-- agentsmith:external-note -->[^\n]*\n/;
const NOTE_CLOSE_LINE = /<!-- \/agentsmith:external-note -->[^\n]*(?:\n|$)/;
const FIRST_HEADING = /^#+[ \t]+\S.*$/m;
const DEFINES_LAYOUT_TAG = /^#+[ \t]+#swe-docs-layout(?:[ \t]|$)/;
const FIRST_CELL = /^(\|[ \t]*)`[^`]*`/;

/** True when the text's first heading defines `#swe-docs-layout`: the map's own module.
 * Exported so a caller can ask the question directly rather than inferring it from the
 * transform returning something other than its input -- that inference holds only while
 * the map module carries an external-note block for the transform to resolve. */
export const definesLayoutTag = (text) => {
  const heading = FIRST_HEADING.exec(text)?.[0];
  return heading !== undefined && DEFINES_LAYOUT_TAG.test(heading);
};

/**
 * Apply docs-layout overrides to the `#swe-docs-layout` rule module and resolve its external-note block.
 * Self-selects on the tag: a text whose first heading does not define `#swe-docs-layout` is returned unchanged.
 * A relocated row gets its new path in a code span; an external row renders as ``external -- `label` ``.
 * The note block is kept (markers removed) when at least one row is external, else stripped whole,
 * including the blank line before it, so no overrides yields the pre-insertion module source.
 * Throws, naming the module, on an unparseable table, a non-bare owner cell, or a duplicate owner
 * when overrides are present, and on an override whose tag is not a table row.
 *
 * @param {{ moduleText: string, overrides: Record<string, { path: string } | { external: string }> }} input
 * @returns {string}
 */
export function applyLayoutOverrides({ moduleText, overrides }) {
  if (!definesLayoutTag(moduleText)) return moduleText;

  const tags = Object.keys(overrides ?? {});
  let text = moduleText;
  if (tags.length > 0) {
    const owners = parseLayoutTable(moduleText).map((row) => row.owner);
    const unknown = tags.find((tag) => !owners.includes(tag));
    if (unknown !== undefined) throw fail('an override targets a tag that is not a table row');
    const rendered = (override) => ('external' in override ? `external -- \`${override.external}\`` : `\`${override.path}\``);
    let rowIndex = -1;
    let tableLine = -1;
    text = moduleText
      .split('\n')
      .map((line) => {
        if (!line.startsWith('|')) return line;
        tableLine += 1;
        if (tableLine < 2) return line;
        rowIndex += 1;
        const override = overrides[owners[rowIndex]];
        return override === undefined ? line : line.replace(FIRST_CELL, (_, lead) => `${lead}${rendered(override)}`);
      })
      .join('\n');
  }

  const anyExternal = tags.some((tag) => 'external' in overrides[tag]);
  return anyExternal
    ? text.replace(NOTE_OPEN_LINE, '').replace(NOTE_CLOSE_LINE, '')
    : text.replace(NOTE_BLOCK, '');
}

// A prefix of one segment is the docs root, which the map does not own.
const MIN_PREFIX_SEGMENTS = 2;
const PLACEHOLDER_OPEN = '<';

/**
 * Derive the directory prefixes the map owns, by parsing the map itself -- each
 * default path's directory up to its first placeholder -- so the lint below
 * cannot drift from the table. Bare `docs/` is deliberately not a prefix: the
 * map owns the record directories under the docs root, not the root itself, so
 * a rule naming `docs/` generically is outside the lint by construction.
 *
 * @param {string | { path: string }[]} source The rule module's text, or rows from `parseLayoutTable`.
 * @returns {string[]} Unique prefixes, each ending in a slash, sorted.
 */
export function deriveMappedPrefixes(source) {
  const rows = typeof source === 'string' ? parseLayoutTable(source) : source;
  const prefixes = rows.map(({ path }) => {
    const head = path.split(PLACEHOLDER_OPEN)[0];
    const cut = head.lastIndexOf('/');
    return cut === -1 ? '' : head.slice(0, cut + 1);
  });
  const owned = prefixes.filter((p) => p.split('/').filter(Boolean).length >= MIN_PREFIX_SEGMENTS);
  return [...new Set(owned)].sort();
}

/**
 * Rule lines allowed to name a mapped prefix, as `[module path, distinctive substring]`.
 * Empty at ship: every rule cites the map instead of restating a path it owns.
 * A deliberate later mention costs an entry here, which is the friction that
 * makes the author decide whether they meant a citation.
 *
 * @type {[string, string][]}
 */
export const MAPPED_PREFIX_EXCEPTIONS = [];

/**
 * Find rule modules that restate a path the map owns instead of citing #swe-docs-layout.
 * Pure: the caller supplies the texts, the prefixes (from `deriveMappedPrefixes`) and the
 * exceptions, so a synthetic violation is feedable from a test.
 * The module defining `#swe-docs-layout` is exempt -- it is the map -- and self-selects on
 * the tag rather than on a path, as `applyLayoutOverrides` does.
 *
 * @param {{ path: string, text: string }[]} moduleTexts Module paths (repo-relative, `/`-separated) and their text.
 * @param {string[]} mappedPrefixes Prefixes the map owns.
 * @param {[string, string][]} [exceptions] Declared exceptions.
 * @returns {{ path: string, line: number, prefix: string }[]} One hit per offending line, in input order.
 */
export function mappedPrefixLint(moduleTexts, mappedPrefixes, exceptions = MAPPED_PREFIX_EXCEPTIONS) {
  const allowed = (path, line) => exceptions.some(([p, fragment]) => p === path && line.includes(fragment));
  const hits = [];
  for (const { path, text } of moduleTexts) {
    if (definesLayoutTag(text)) continue;
    text.split(/\r?\n/).forEach((line, index) => {
      const prefix = mappedPrefixes.find((p) => line.includes(p));
      if (prefix === undefined || allowed(path, line)) return;
      hits.push({ path, line: index + 1, prefix });
    });
  }
  return hits;
}
