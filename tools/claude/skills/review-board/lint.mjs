#!/usr/bin/env node
// Store integrity linter for the code-review board (#ai-review-board).
//
// Read-only validator for the local `.agentsmith/review-board/` issue store: it
// never mutates the store, it reports. A non-zero exit means the store is
// structurally invalid. The store is local (gitignored, not committed), so this
// is a local integrity check the review round runs -- not a CI/pre-commit gate.
//
// Store machine files are JSON (issues, epics, rounds), parsed with the built-in
// JSON.parse -- zero dependency, so it runs on bare `node` in a consumer's
// `.claude/`. The hand-maintained `config.yaml` stays YAML; only its single
// `tracker:` scalar is read, with one regex.
//
// Usage:
//   node .claude/skills/review-board/lint.mjs [store-dir] [--strict]
//   (default dir: ./.agentsmith/review-board; --strict promotes warnings to a non-zero exit)

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv, stdout, stderr, exit, cwd } from 'node:process';

const VALID_STATUS = new Set(['open', 'promoted', 'fixed', 'deprecated', 'superseded', 'duplicated']);
const CLOSING_STATUS = new Set(['fixed', 'deprecated', 'superseded', 'duplicated']);
const VALID_KIND = new Set(['issue', 'epic']);

/**
 * Split a compositional id `<roundId>#<role>-<n>` into parts, or null when malformed.
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

export const idToSafe = (id) => id.replace(/#/g, '--');

// The single `tracker:` scalar from the YAML config (kept human-editable).
function trackerConfigured(root) {
  const p = join(root, 'config.yaml');
  if (!existsSync(p)) return false;
  try {
    const m = readFileSync(p, 'utf8').match(/^tracker:[ \t]*(.*)$/m);
    if (!m) return false;
    const v = m[1].trim().replace(/^["']/, '').replace(/["']$/, '');
    return v !== '' && !/^[|>]/.test(v);
  } catch {
    return false;
  }
}

function walkJson(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkJson(abs));
    else if (e.name.endsWith('.json')) out.push(abs);
  }
  return out;
}

function placementOf(relParts) {
  if (relParts.includes('closed')) return 'closed';
  if (relParts.includes('promoted')) return 'promoted';
  return 'open';
}

/**
 * Validate a local `.agentsmith/review-board/` JSON issue store.
 * @param {{ root: string }} input  `root` is the store directory.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function lintStore({ root }) {
  const errors = [];
  const warnings = [];
  if (!existsSync(root)) return { errors, warnings };

  const tracker = trackerConfigured(root);
  const rel = (abs) => relative(root, abs).split(sep).join('/');
  const records = [];

  const collect = (subdir, expectedKind) => {
    for (const abs of walkJson(join(root, subdir))) {
      let obj;
      try {
        obj = JSON.parse(readFileSync(abs, 'utf8'));
      } catch (err) {
        errors.push(`${rel(abs)}: invalid JSON (${err.message})`);
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
        obj,
      });
    }
  };
  collect('issues', 'issue');
  collect('epics', 'epic');

  const roundIds = new Set();
  const roundsDir = join(root, 'rounds');
  if (existsSync(roundsDir)) {
    for (const e of readdirSync(roundsDir)) {
      if (e.endsWith('.json')) roundIds.add(basename(e, '.json'));
    }
  }

  // Pass 1: per-record validation + global id index.
  const idToRecord = new Map();
  for (const r of records) {
    const { obj: o, rel: where } = r;
    const id = o.id;

    if (!id || typeof id !== 'string') {
      errors.push(`${where}: missing required field \`id\``);
      continue;
    }
    if (idToRecord.has(id)) {
      errors.push(`${where}: duplicate id \`${id}\` (also at ${idToRecord.get(id).rel})`);
    } else {
      idToRecord.set(id, r);
    }

    const idParts = parseId(id);
    if (!idParts) errors.push(`${where}: malformed id \`${id}\` (expected \`<roundId>#<role>-<n>\`)`);

    if (!VALID_KIND.has(o.kind)) {
      errors.push(`${where}: invalid kind \`${o.kind ?? '(missing)'}\` (expected issue or epic)`);
    } else if (o.kind !== r.expectedKind) {
      errors.push(`${where}: kind \`${o.kind}\` but file is under ${r.relParts[0]}/ (expected kind ${r.expectedKind})`);
    }

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

    const stem = basename(where, '.json');
    if (!stem.startsWith(idToSafe(id))) {
      warnings.push(`${where}: filename does not start with the id rendered safe (\`${idToSafe(id)}\`)`);
    }

    if (!VALID_STATUS.has(o.status)) {
      errors.push(`${where}: invalid status \`${o.status ?? '(missing)'}\``);
    } else {
      const expectedPlacement =
        o.status === 'promoted' ? 'promoted' : CLOSING_STATUS.has(o.status) ? 'closed' : 'open';
      if (r.placement !== expectedPlacement) {
        errors.push(`${where}: status \`${o.status}\` requires placement \`${expectedPlacement}/\` but file is in \`${r.placement}\``);
      }
      if (CLOSING_STATUS.has(o.status)) {
        if (typeof o.closingComments !== 'string' || o.closingComments.trim() === '') {
          errors.push(`${where}: closing status \`${o.status}\` requires non-empty \`closingComments\``);
        }
        if (!o.closedInRound) {
          errors.push(`${where}: closing status \`${o.status}\` requires \`closedInRound\``);
        }
      }
      if (o.status === 'promoted' && tracker && !o.promotedTo) {
        errors.push(`${where}: status \`promoted\` requires \`promotedTo\` (a tracker is configured in config.yaml)`);
      }
    }

    if (!o.lastConfirmedCommit) {
      warnings.push(`${where}: missing \`lastConfirmedCommit\` (every issue is anchored to a baseline SHA)`);
    }
    if (idParts && roundIds.size > 0 && !roundIds.has(idParts.roundId)) {
      warnings.push(`${where}: id round prefix \`${idParts.roundId}\` has no rounds/${idParts.roundId}.json`);
    }
  }

  // Pass 2: relatedIssues referential integrity.
  for (const r of records) {
    const { obj: o, rel: where } = r;
    const refs = Array.isArray(o.relatedIssues) ? o.relatedIssues : [];
    for (const ref of refs) {
      const refId = ref && ref.issueId;
      if (!refId) continue;
      if (refId === o.id) {
        warnings.push(`${where}: relatedIssues references itself (\`${refId}\`)`);
        continue;
      }
      if (!idToRecord.has(refId)) {
        errors.push(`${where}: relatedIssues references unknown id \`${refId}\``);
      }
    }
  }

  // Round files: the baseline invariant + self-consistency.
  for (const abs of existsSync(roundsDir)
    ? readdirSync(roundsDir).filter((e) => e.endsWith('.json')).map((e) => join(roundsDir, e))
    : []) {
    let o;
    try {
      o = JSON.parse(readFileSync(abs, 'utf8'));
    } catch (err) {
      errors.push(`${rel(abs)}: invalid JSON (${err.message})`);
      continue;
    }
    const where = rel(abs);
    const stem = basename(where, '.json');
    if (!o.id) errors.push(`${where}: round is missing \`id\``);
    else if (o.id !== stem) errors.push(`${where}: round id \`${o.id}\` != filename stem \`${stem}\``);
    if (!o.baselineCommit)
      errors.push(`${where}: \`baselineCommit\` is missing -- it must always be a live default-branch SHA`);
    if (!o.commit) errors.push(`${where}: round is missing \`commit\``);
    if (o.previousRound && !roundIds.has(o.previousRound))
      warnings.push(`${where}: previousRound \`${o.previousRound}\` has no rounds/${o.previousRound}.json`);
  }

  return { errors, warnings };
}

// ---------- CLI ----------

const invokedDirectly = argv[1] && fileURLToPath(import.meta.url) === resolve(argv[1]);
if (invokedDirectly) {
  const strict = argv.includes('--strict');
  const dirArg = argv.slice(2).find((a) => !a.startsWith('--'));
  const root = resolve(dirArg || join(cwd(), '.agentsmith', 'review-board'));
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
