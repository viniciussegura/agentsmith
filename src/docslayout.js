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
  // `<slug>` is required, not optional: #swe-epic mandates fixed children per
  // epic directory (README.md, roadmap.md, open-questions.md), so a path without
  // the slug collapses every epic into one directory and the second overwrites
  // the first. It is a directory-per-record row, not a file-per-record one.
  'swe-epic': { external: false, placeholder: '<slug>' },
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
const PLACEHOLDER_OPEN = '<';
const PLACEHOLDER_SUBSTITUTE = '0';
const LITERAL_PATH = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*\/?$/;
const EXTERNAL_LABEL = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/;
const FORBIDDEN_SEGMENT = 'node_modules';
const PROTECTED_BASENAMES = new Set(['agents.md', 'claude.md', 'gemini.md', 'package.json']);
const ROWS_KEY = 'rows:';
const TOP_LEVEL_KEY = /^[A-Za-z_][\w-]*:/;
const ROW_KEY = /^([a-z][a-z0-9-]*):$/;
const HASHED_ROW_KEY = /^[ \t]*#([a-z][a-z0-9-]*):[ \t]*$/;
const TRAILING_COMMENT = /[ \t]+#.*$/;
const FIELD_LINE = /^([a-z]+):(?: +(.*))?$/;
const ROW_INDENT = 2;
const FIELD_INDENT = 4;
const INDENT_RULE = 'rows: at column 0, a row key at exactly 2 spaces, a field at exactly 4 spaces';
const JUNK_ALLOWED = 'allowed are rows:, a row key, a path or external field, blank lines and # comments';

/**
 * Merge the parsed table with `ROW_POLICY`, deny-by-default: a tag absent from
 * the policy is ineligible for `external` and requires no placeholder.
 * The table's own `path` is carried through as each row's default: an un-overridden row
 * still occupies it, and its trailing slash states whether the row's records are
 * directories -- neither of which is policy, so neither belongs in `ROW_POLICY`.
 *
 * @param {{ owner: string, path?: string }[]} tableRows Output of `parseLayoutTable`.
 * @returns {{ owner: string, external: boolean, placeholder: string | null, path: string }[]}
 */
export function withRowPolicy(tableRows) {
  return tableRows.map(({ owner, path = '' }) => {
    const policy = Object.hasOwn(ROW_POLICY, owner) ? ROW_POLICY[owner] : undefined;
    return { owner, external: policy?.external === true, placeholder: policy?.placeholder ?? null, path };
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

/**
 * @param {string} value
 * @param {{ placeholder?: string | null, path?: string }} policy The row's policy and default path.
 * @returns {[string, string] | null} [what is wrong, what is allowed], or null when valid.
 */
const pathProblem = (value, { placeholder = null, path: defaultPath = '' }) => {
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
  // The rules above pass on the substituted path, so they are re-applied to the path
  // with its placeholders ELIDED: `AGENTS<name>.md` substitutes to `AGENTS0.md` and
  // `docs/<slug>.git/` to `docs/0.git/`, but a reader resolving the placeholder to
  // nothing lands on the protected file and inside `.git`. A dot-leading elided segment
  // covers `..` as well, so elision cannot forge a traversal the literal form would have
  // been refused. The final segment is a directory exactly when the path ends in a
  // slash; a final FILE name is exempt, because eliding a placeholder legitimately
  // leaves a dotted remainder there (`docs/<name>.md` -> `docs/.md`).
  // Elided per segment, never from the path as a whole: a segment that is a bare
  // placeholder elides to nothing, and dropping it shifts every later segment up a
  // position, so `docs/<slug>.git/<name>` would leave `.git` in the final position the
  // rule below exempts.
  const segments = (value.endsWith('/') ? value.slice(0, -1) : value).split('/');
  const elide = (segment) => PLACEHOLDER_TOKENS.reduce((acc, token) => acc.replaceAll(token, ''), segment);
  // A final FILE name is exempt, because eliding a placeholder legitimately leaves a dotted
  // remainder there (`docs/<name>.md` -> `docs/.md`); a directory is not. An all-placeholder
  // directory elides to nothing, which names one record rather than reaching anywhere.
  const directories = (value.endsWith('/') ? segments : segments.slice(0, -1)).map(elide);
  if (directories.some((segment) => segment !== '' && (segment.startsWith('.') || segment === FORBIDDEN_SEGMENT))) {
    return [
      `path reaches a dot directory or ${FORBIDDEN_SEGMENT} once a placeholder is elided`,
      'give every directory segment literal text of its own',
    ];
  }
  // Checked before the rules below, so naming a protected file says so rather than
  // blaming the path's shape.
  const substituteOne = (segment) => PLACEHOLDER_TOKENS.reduce((acc, token) => acc.replaceAll(token, PLACEHOLDER_SUBSTITUTE), segment);
  for (const segment of segments.flatMap((s) => [substituteOne(s), elide(s)])) {
    if (PROTECTED_BASENAMES.has(segment.toLowerCase())) {
      return ['path names an instruction or manifest file', 'those files cannot be a remap target'];
    }
  }
  // A bare placeholder at the repository root resolves to any filename the agent
  // chooses, including the protected ones the denylist just refused.
  if (!value.includes('/')) {
    return ['path names a file at the repository root', 'put a documentation path under a directory'];
  }
  // The same holds a level up, for a DIRECTORY the agent resolves: the checks above bound
  // what a placeholder can reach only where some literal text pins the segment down, and
  // the root is the one segment where resolving to `.git` or `node_modules` hits the real
  // thing. A placeholder below a literal root stays contained, so `docs/epics/<slug>/` --
  // the shipped epics default -- is unaffected. Any `<` left here opens a known token:
  // the unknown-placeholder rule above has already rejected every other use.
  if ((segments[0] ?? '').includes(PLACEHOLDER_OPEN)) {
    return [
      'path lets a placeholder name a top-level directory',
      'start the path with a literal directory, so the repository root is pinned down',
    ];
  }
  if (placeholder !== null && !value.includes(placeholder)) {
    return [`path drops the ${placeholder} placeholder this row requires`, `keep ${placeholder} in the new path`];
  }
  // A row whose default path is a directory stores each record as a directory, not as a
  // file: #swe-epic mandates children inside each epic's own directory, which a file per
  // epic cannot hold. The map's trailing slash already says this, so it is read from there
  // rather than declared in ROW_POLICY.
  if (defaultPath.endsWith('/') && !value.endsWith('/')) {
    return ['path does not name a directory, which this row requires', 'end the path with a slash: this row stores each record as its own directory'];
  }
  return null;
};

/** @returns {[string, string] | null} */
const externalProblem = (value) => {
  if (!EXTERNAL_LABEL.test(value)) {
    return [
      'external label is not valid',
      'use 1 to 40 characters of letters, digits, dot, underscore, slash and hyphen, starting with a letter or digit, with no spaces',
    ];
  }
  // The charset admits `/` and `.`, so a label can read exactly like a path. The
  // note tells the agent a label is a hint and not an address, but a label shaped
  // like a traversal is the one most likely to be treated as one anyway.
  if (value.includes('..') || value.split('/').includes(FORBIDDEN_SEGMENT)) {
    return ['external label looks like a filesystem path', 'name the system or its project key, with no .. and no node_modules'];
  }
  return null;
};

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

  const rowLines = new Map();

  const closeRow = () => {
    if (current === null) return;
    if (current.override === null) {
      throw error(current.line, 'row declares neither path nor external', 'declare exactly one of path or external');
    }
    overrides[current.tag] = current.override;
    rowLines.set(current.tag, current.line);
    current = null;
  };

  lines.forEach((raw, index) => {
    const lineNo = index + 1;
    // A row key written with its leading `#` is a mistake, not a comment, and it is
    // the mistake the surfaces invite: every other agentsmith surface -- including
    // this module's own unknown-tag message -- spells these tags as `#swe-...`.
    // Swallowing it as a comment yields a silent no-op remap. Only a known row tag
    // reads that way: `#rows:` or `#todo:` is an ordinary comment, so commenting the
    // config out -- the documented way to turn the remap off -- is not an error.
    const hashedTag = HASHED_ROW_KEY.exec(raw)?.[1];
    if (hashedTag !== undefined && known.has(hashedTag)) {
      throw error(lineNo, 'row key is written with a leading #', 'write the owner tag bare, or put a space after the # to comment the line out');
    }
    // Stripped as YAML strips it, and only after the check above, which must still see a
    // row key the author commented out. No allowed value admits a `#`, so one with no
    // whitespace before it stays part of the value for the charset rules to reject.
    const line = raw.replace(TRAILING_COMMENT, '');
    if (line === '' || /^\s*#/.test(line)) return;

    const leading = /^[ \t]*/.exec(line)[0];
    if (leading.includes('\t')) throw error(lineNo, 'indentation uses a tab', `use spaces: ${INDENT_RULE}`);
    const indent = leading.length;
    const content = line.slice(indent);

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
      const problem = field === 'path' ? pathProblem(value, current.policy) : externalProblem(value);
      if (problem !== null) throw error(lineNo, ...problem);
      current.override = { [field]: value };
      return;
    }

    throw error(lineNo, 'wrong indentation', INDENT_RULE);
  });
  closeRow();

  // Two rows resolving to one location give an agent contradictory instructions: the rules
  // tell it to scan a directory for every record of one type, so a directory holding two
  // types answers both scans with the other's records -- #swe-technical-debts says its
  // directory holds only open debts. A row keeps its default path until overridden, so a
  // relocation onto a directory another row still holds by default collides too.
  // The location compared is the path minus a final segment that names one record, so two
  // rows that each collapse to a single fixed file may share a parent: the decision file
  // permits a row to become one file, and two files in `docs/` answer no scan ambiguously.
  // A location is compared lowercased, because the default Windows and macOS filesystems
  // treat `docs/Notes/` and `docs/notes/` as one directory.
  // `directories` says what the row claims there: a path ending in a slash after a segment
  // naming one record stores each record as its own directory, and so claims every
  // directory at that location, while any other shape claims files. That is the whole
  // difference between `docs/<slug>/`, which would read the other rows' default
  // directories as its own records, and `docs/<YYYY-MM-DD>-<slug>.md`, which leaves them be.
  // Keyed on the FIRST segment carrying a placeholder, not the last: everything before it is
  // fixed and is the location, everything from it on is one record's own. A placeholder in a
  // directory position is what makes `docs/<slug>/index.md` a directory per record under
  // `docs/` rather than the single fixed file its file name suggests.
  const locationOf = (path) => {
    const segments = (path.endsWith('/') ? path.slice(0, -1) : path).split('/');
    const named = segments.findIndex((segment) => segment.includes(PLACEHOLDER_OPEN));
    if (named === -1) return { at: path.toLowerCase(), directories: false };
    const at = `${segments.slice(0, named).join('/')}/`.toLowerCase();
    return { at, directories: named < segments.length - 1 || path.endsWith('/') };
  };
  // Nesting one record directory inside another is not in itself a collision -- the whole
  // map nests under `docs/`, and the map owns those directories rather than the root (see
  // `deriveMappedPrefixes`). The harmful cases are a shared location, a record file inside
  // another row's record directory, and a record directory inside one: each answers a scan
  // the owner rules make with another row's records.
  const bare = (at) => (at.endsWith('/') ? at.slice(0, -1) : at);
  // Trailing slash ignored, so a file cannot take the name of another row's directory.
  const sameLocation = (a, b) => bare(a.at) === bare(b.at);
  const holdsFile = (dir, file) => dir.at.endsWith('/') && !file.at.endsWith('/') && file.at.startsWith(dir.at);
  const holdsDirectory = (dir, other) => dir.directories && other.at.endsWith('/') && other.at.startsWith(dir.at);
  const overlaps = (a, b) =>
    sameLocation(a, b) || holdsFile(a, b) || holdsFile(b, a) || holdsDirectory(a, b) || holdsDirectory(b, a);

  const resolved = [];
  for (const { owner, path } of knownRows) {
    const override = overrides[owner];
    if (override !== undefined && 'external' in override) continue;
    const effective = override?.path ?? path;
    if (effective === '') continue;
    const line = rowLines.get(owner);
    const location = locationOf(effective);
    // Only a pair the config had a hand in: two defaults colliding would be the shipped
    // map's doing, which this file's author cannot act on and no line here could name.
    const clash = resolved.find((other) => overlaps(other.location, location) && (line !== undefined || other.line !== undefined));
    if (clash !== undefined) {
      // Blame the row written later in the file and name the other one, so the message
      // always points at a line the author can edit -- the colliding row may be a default
      // they never wrote, and table order is not file order.
      const [at, other] = (line ?? 0) >= (clash.line ?? 0) ? [line ?? 0, clash.owner] : [clash.line ?? 0, owner];
      throw error(at, `row resolves to the same location as #${other}`, 'give each row a directory or file of its own');
    }
    resolved.push({ owner, location, line });
  }

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
