#!/usr/bin/env node
// Store integrity linter for the code-review board (#ai-review-board).
//
// Read-only validator for a `reviews/` issue store: it never mutates the store,
// it reports. A non-zero exit means the store is structurally invalid; wire it
// into CI (or run it at the end of a review round) so the invariants the SKILL
// describes are enforced mechanically instead of trusted to the agent.
//
// Zero-dependency on purpose -- it ships into a consumer's `.claude/` and must
// run on bare `node`, so it does NOT parse arbitrary YAML. It extracts the
// handful of fields the invariants need with line-anchored scans (the same
// minimal-parse stance as src/bundles.js), and is tolerant of block scalars and
// decoration it does not read.
//
// Usage:
//   node .claude/skills/review-board/lint.mjs [reviews-dir] [--strict]
//   (default dir: ./reviews; --strict promotes warnings to a non-zero exit)

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv, stdout, stderr, exit, cwd } from 'node:process';

const VALID_STATUS = new Set([
  'open',
  'promoted',
  'fixed',
  'deprecated',
  'superseded',
  'duplicated',
]);
const CLOSING_STATUS = new Set(['fixed', 'deprecated', 'superseded', 'duplicated']);
const VALID_KIND = new Set(['issue', 'epic']);

// ---------- minimal field extraction ----------

// A top-level `key: value` scalar. Returns undefined when the key is absent,
// '' when present but empty or a block scalar (`|`/`>`), else the trimmed,
// unquoted value. Anchored at column 0, so indented block-scalar bodies never
// masquerade as top-level keys.
function topScalar(text, key) {
  const m = text.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
  if (!m) return undefined;
  const v = m[1].trim();
  if (v === '' || /^[|>][+-]?$/.test(v)) return '';
  return v.replace(/^["']/, '').replace(/["']$/, '');
}

// True when a key is present with non-empty content -- an inline value or, for a
// block scalar, at least one non-empty indented line beneath it.
function keyPresentNonEmpty(text, key) {
  const inline = topScalar(text, key);
  if (inline === undefined) return false;
  if (inline !== '') return true;
  const lines = text.split('\n');
  const idx = lines.findIndex((l) => new RegExp(`^${key}:`).test(l));
  if (idx === -1) return false;
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) break;
    if (lines[i].trim() !== '') return true;
  }
  return false;
}

// The indented lines belonging to a top-level key's block (until the next
// column-0 key). Used to sub-scan sequences of maps.
function blockLines(text, key) {
  const lines = text.split('\n');
  const idx = lines.findIndex((l) => new RegExp(`^${key}:`).test(l));
  if (idx === -1) return [];
  const out = [];
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out;
}

// Every `<subkey>: value` within a block (sequence items or nested maps).
function subValues(lines, subkey) {
  const out = [];
  const re = new RegExp(`^\\s+-?\\s*${subkey}:[ \\t]*(.+)$`);
  for (const l of lines) {
    const m = l.match(re);
    if (m) out.push(m[1].trim().replace(/^["']/, '').replace(/["']$/, ''));
  }
  return out;
}

/**
 * Extract the validated subset of an Issue/Epic YAML file.
 * @param {string} text
 */
export function parseIssue(text) {
  return {
    id: topScalar(text, 'id'),
    kind: topScalar(text, 'kind'),
    title: topScalar(text, 'title'),
    status: topScalar(text, 'status'),
    priority: topScalar(text, 'priority'),
    lastConfirmedCommit: topScalar(text, 'lastConfirmedCommit'),
    closedInRound: topScalar(text, 'closedInRound'),
    promotedTo: topScalar(text, 'promotedTo'),
    hasClosingComments: keyPresentNonEmpty(text, 'closingComments'),
    relatedIssueIds: subValues(blockLines(text, 'relatedIssues'), 'issueId'),
    locationFilenames: subValues(blockLines(text, 'locations'), 'filename'),
  };
}

/**
 * Split a compositional id `<roundId>#<role>-<n>` into its parts, or null when
 * malformed. The role segment is `epic` for epics, else a reviewer role id.
 * @param {string} id
 */
export function parseId(id) {
  if (typeof id !== 'string') return null;
  const hash = id.indexOf('#');
  if (hash === -1) return null;
  const roundId = id.slice(0, hash);
  const m = id.slice(hash + 1).match(/^([a-z][a-z0-9]*)-(\d+)$/i);
  if (!roundId || !m) return null;
  return { roundId, role: m[1].toLowerCase(), n: Number(m[2]) };
}

const idToSafe = (id) => id.replace(/#/g, '--');

// ---------- filesystem walk ----------

function walkYaml(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkYaml(abs));
    else if (e.name.endsWith('.yaml')) out.push(abs);
  }
  return out;
}

// Placement is derived from the path: a `closed/` or `promoted/` segment under
// the role/epics directory, else `open`.
function placementOf(relParts) {
  if (relParts.includes('closed')) return 'closed';
  if (relParts.includes('promoted')) return 'promoted';
  return 'open';
}

// ---------- the lint ----------

/**
 * Validate a `reviews/` store. Returns human-readable errors and warnings;
 * never throws on store content and never mutates the store.
 * @param {{ root: string }} input  `root` is the reviews directory.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function lintStore({ root }) {
  const errors = [];
  const warnings = [];
  if (!existsSync(root)) return { errors, warnings };

  const rel = (abs) => relative(root, abs).split(sep).join('/');
  const records = [];

  const collect = (subdir, expectedKind) => {
    for (const abs of walkYaml(join(root, subdir))) {
      let text;
      try {
        text = readFileSync(abs, 'utf8');
      } catch (err) {
        errors.push(`${rel(abs)}: cannot read file (${err.code || err.message})`);
        continue;
      }
      const relParts = relative(root, abs).split(sep);
      records.push({
        abs,
        rel: rel(abs),
        relParts,
        expectedKind,
        roleDir: subdir === 'issues' ? relParts[1] : null,
        placement: placementOf(relParts.slice(1, -1)),
        parsed: parseIssue(text),
      });
    }
  };
  collect('issues', 'issue');
  collect('epics', 'epic');

  // Round ids declared by round files (used for the soft prefix check).
  const roundIds = new Set();
  const roundsDir = join(root, 'rounds');
  if (existsSync(roundsDir)) {
    for (const e of readdirSync(roundsDir)) {
      if (e.endsWith('.yaml')) roundIds.add(basename(e, '.yaml'));
    }
  }

  // Pass 1: per-record validation + global id index.
  const idToRecord = new Map();
  for (const r of records) {
    const { parsed: p, rel: where } = r;

    if (!p.id) {
      errors.push(`${where}: missing required field \`id\``);
      continue;
    }
    if (idToRecord.has(p.id)) {
      errors.push(`${where}: duplicate id \`${p.id}\` (also at ${idToRecord.get(p.id).rel})`);
    } else {
      idToRecord.set(p.id, r);
    }

    const idParts = parseId(p.id);
    if (!idParts) {
      errors.push(`${where}: malformed id \`${p.id}\` (expected \`<roundId>#<role>-<n>\`)`);
    }

    // kind present and consistent with the directory it lives in.
    if (!VALID_KIND.has(p.kind)) {
      errors.push(`${where}: invalid kind \`${p.kind ?? '(missing)'}\` (expected issue or epic)`);
    } else if (p.kind !== r.expectedKind) {
      errors.push(`${where}: kind \`${p.kind}\` but file is under ${r.relParts[0]}/ (expected kind ${r.expectedKind})`);
    }

    // id role segment vs location.
    if (idParts) {
      if (r.expectedKind === 'epic' && idParts.role !== 'epic') {
        errors.push(`${where}: epic id role segment \`${idParts.role}\` must be \`epic\``);
      }
      if (r.expectedKind === 'issue') {
        if (idParts.role === 'epic') {
          errors.push(`${where}: issue id uses the reserved \`epic\` role segment`);
        } else if (r.roleDir && idParts.role !== r.roleDir) {
          errors.push(`${where}: id role \`${idParts.role}\` != role directory \`${r.roleDir}\``);
        }
      }
    }

    // filename encodes the id (slug is decoration; identity keys off the id).
    const stem = basename(where, '.yaml');
    if (!stem.startsWith(idToSafe(p.id))) {
      warnings.push(`${where}: filename does not start with the id rendered safe (\`${idToSafe(p.id)}\`)`);
    }

    // status validity + placement coupling.
    if (!VALID_STATUS.has(p.status)) {
      errors.push(`${where}: invalid status \`${p.status ?? '(missing)'}\``);
    } else {
      const expectedPlacement =
        p.status === 'promoted' ? 'promoted' : CLOSING_STATUS.has(p.status) ? 'closed' : 'open';
      if (r.placement !== expectedPlacement) {
        errors.push(
          `${where}: status \`${p.status}\` requires placement \`${expectedPlacement}/\` but file is in \`${r.placement}\``,
        );
      }
      if (CLOSING_STATUS.has(p.status)) {
        if (!p.hasClosingComments) {
          errors.push(`${where}: closing status \`${p.status}\` requires non-empty \`closingComments\``);
        }
        if (!p.closedInRound) {
          errors.push(`${where}: closing status \`${p.status}\` requires \`closedInRound\``);
        }
      }
      if (p.status === 'promoted' && !p.promotedTo) {
        errors.push(`${where}: status \`promoted\` requires \`promotedTo\``);
      }
    }

    if (!p.lastConfirmedCommit) {
      warnings.push(`${where}: missing \`lastConfirmedCommit\` (every issue is anchored to a baseline SHA)`);
    }

    // Soft check: the id's round prefix should name a known round file.
    if (idParts && roundIds.size > 0 && !roundIds.has(idParts.roundId)) {
      warnings.push(`${where}: id round prefix \`${idParts.roundId}\` has no rounds/${idParts.roundId}.yaml`);
    }
  }

  // Pass 2: relatedIssues referential integrity.
  for (const r of records) {
    const { parsed: p, rel: where } = r;
    for (const ref of p.relatedIssueIds) {
      if (ref === p.id) {
        warnings.push(`${where}: relatedIssues references itself (\`${ref}\`)`);
        continue;
      }
      if (!idToRecord.has(ref)) {
        errors.push(`${where}: relatedIssues references unknown id \`${ref}\``);
      }
    }
  }

  // Round files: the baseline invariant + self-consistency.
  for (const abs of existsSync(roundsDir)
    ? readdirSync(roundsDir).filter((e) => e.endsWith('.yaml')).map((e) => join(roundsDir, e))
    : []) {
    let text;
    try {
      text = readFileSync(abs, 'utf8');
    } catch (err) {
      errors.push(`${rel(abs)}: cannot read file (${err.code || err.message})`);
      continue;
    }
    const where = rel(abs);
    const id = topScalar(text, 'id');
    const baselineCommit = topScalar(text, 'baselineCommit');
    const commit = topScalar(text, 'commit');
    const previousRound = topScalar(text, 'previousRound');
    const stem = basename(where, '.yaml');

    if (!id) errors.push(`${where}: round is missing \`id\``);
    else if (id !== stem) errors.push(`${where}: round id \`${id}\` != filename stem \`${stem}\``);
    if (!baselineCommit)
      errors.push(`${where}: \`baselineCommit\` is missing -- it must always be a live default-branch SHA`);
    if (!commit) errors.push(`${where}: round is missing \`commit\``);
    if (previousRound && !roundIds.has(previousRound))
      warnings.push(`${where}: previousRound \`${previousRound}\` has no rounds/${previousRound}.yaml`);
  }

  return { errors, warnings };
}

// ---------- CLI ----------

const invokedDirectly = argv[1] && fileURLToPath(import.meta.url) === resolve(argv[1]);
if (invokedDirectly) {
  const strict = argv.includes('--strict');
  const dirArg = argv.slice(2).find((a) => !a.startsWith('--'));
  const root = resolve(dirArg || join(cwd(), 'reviews'));
  const found = existsSync(root);
  const { errors, warnings } = lintStore({ root });

  for (const w of warnings) stderr.write(`warning: ${w}\n`);
  for (const e of errors) stderr.write(`error: ${e}\n`);
  stdout.write(
    `review-board lint: ${errors.length} error(s), ${warnings.length} warning(s)` +
      `${found ? '' : ' (no store at ' + root + ')'}\n`,
  );
  if (errors.length || (strict && warnings.length)) exit(1);
}
