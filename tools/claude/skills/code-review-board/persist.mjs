#!/usr/bin/env node
// Deterministic persistence for the code-review board (#ai-review-board).
//
// Reads the round's JSON scratch (round meta, findings, verdicts, pm-directive)
// and writes the canonical JSON store, applying verdicts, reconcile transitions,
// and the PM directive. Zero dependency: JSON.parse/JSON.stringify only. Runs the
// store linter as its last step and returns (CLI: exits) non-zero on any violation.
//
// Usage:
//   node persist.mjs summary <store-dir> <round-id>
//   node persist.mjs apply   <store-dir> <round-id>

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { argv, stdout, stderr, exit } from 'node:process';
import { lintStore, idToSafe, parseId } from './lint.mjs';
import { isMain } from './is-main.mjs';

// The owning role is the id's `<role>` segment (`<roundId>#<role>-<n>`, issue-format.md);
// a findings file declares no role field of its own.
const roleOf = (id) => parseId(id)?.role;

// ---------- io helpers ----------

// A parse failure names the file: in a round with eight scratch files a bare SyntaxError locates nothing.
function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (err) {
    throw new Error(`cannot read JSON at ${p}: ${err.message}`);
  }
}

function writeJson(p, o) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(o, null, 2) + '\n');
}

function slugify(title) {
  const s = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 6)
    .join('-');
  return s || 'issue';
}

const issueFileName = (issue) => `${idToSafe(issue.id)}-${slugify(issue.title)}.json`;

// Default scratch dir for a store: .agentsmith/review-board -> .agentsmith/tmp/review-board/<roundId>.
function defaultScratchDir(store, roundId) {
  return join(dirname(store), 'tmp', 'review-board', roundId);
}

const isBlank = (v) => v === undefined || v === null || v === '';

function readDirJson(dir) {
  return readDirJsonNamed(dir).map((n) => n.data);
}

// Same, keeping each file's name: a validation message must say which file a finding came from.
function readDirJsonNamed(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((e) => e.endsWith('.json'))
    .map((e) => ({ file: e, data: readJson(join(dir, e)) }));
}

function walk(dir, fn) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) walk(abs, fn);
    else if (e.name.endsWith('.json')) fn(abs);
  }
}

// Index existing issue files by id -> { absPath, obj, roleDir, placement }.
function indexStore(store) {
  const index = new Map();
  walk(join(store, 'issues'), (abs) => {
    const obj = readJson(abs);
    const relParts = abs.slice(join(store, 'issues').length + 1).split(/[\\/]/);
    const roleDir = relParts[0];
    const placement = relParts.includes('closed') ? 'closed' : relParts.includes('promoted') ? 'promoted' : 'open';
    index.set(obj.id, { absPath: abs, obj, roleDir, placement });
  });
  return index;
}

function issuePath(store, roleDir, placement, issue) {
  const dir = placement === 'open' ? join(store, 'issues', roleDir) : join(store, 'issues', roleDir, placement);
  return join(dir, issueFileName(issue));
}

// ---------- round-record validation ----------

// ReviewRoundInfo, per issue-format.md. Checked before any write: the round file is
// NAMED from `record.id`, so an absent or drifted field used to produce
// `rounds/undefined.json` and exit 0 -- a defect caught only by lint, after the whole
// round had run, and never by the step that caused it. Two such rounds in one store
// then overwrote each other at that single filename.
const ROUND_REQUIRED = ['id', 'mode', 'targetRef', 'commit', 'baselineCommit', 'roles'];
const ROUND_OPTIONAL = ['previousRound'];

/**
 * Throw unless `record` matches ReviewRoundInfo. Reports EVERY problem at once --
 * missing required fields and unknown ones together -- because the failure this
 * exists for is a drifted field name (`selectedRoles` for `roles`), which is only
 * legible when both halves are named in the same message.
 * @param {unknown} record
 * @param {string} source  path of the file it came from, for the message
 */
export function assertRoundRecord(record, source) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error(`round record (${source}) is not a JSON object`);
  }
  const missing = ROUND_REQUIRED.filter((k) => isBlank(record[k]));
  const known = new Set([...ROUND_REQUIRED, ...ROUND_OPTIONAL]);
  const unknown = Object.keys(record).filter((k) => !known.has(k));
  if (!missing.length && !unknown.length) return;

  const problems = [];
  if (missing.length) problems.push(`missing required field(s): ${missing.join(', ')}`);
  if (unknown.length) problems.push(`unknown field(s): ${unknown.join(', ')}`);
  throw new Error(
    `round record (${source}) does not match ReviewRoundInfo -- ${problems.join('; ')}. ` +
      `Required: ${ROUND_REQUIRED.join(', ')}; optional: ${ROUND_OPTIONAL.join(', ')}. ` +
      'Build it with roundRecord() from round-args.mjs rather than by hand.',
  );
}

// The Issue fields a reviewer must emit, the ones it may, and the priority bands (issue-format.md).
export const FINDING_REQUIRED = ['id', 'title', 'description', 'priority', 'priorityRationale'];
// A reviewer may pre-set these; the closed-state fields (closedInRound, promotedTo,
// closingComments) are set by persist or /review-promote, so on a NEW finding they are unknown.
const FINDING_OPTIONAL = ['kind', 'status', 'lastConfirmedCommit', 'locations', 'relatedIssues'];
const FINDING_STRING = ['id', 'title', 'description', 'priorityRationale'];
const PRIORITIES = new Set(['low', 'medium', 'high']);
const FINDING_KNOWN = new Set([...FINDING_REQUIRED, ...FINDING_OPTIONAL]);


/** Every way one raw `new` finding fails the Issue contract, as messages; empty when it conforms. */
function findingProblems(raw, roundId) {
  const problems = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['is not a JSON object'];
  const parts = parseId(raw.id);
  if (!parts) problems.push('id is malformed (expected `<roundId>#<role>-<n>`)');
  else {
    if (parts.role === 'epic') problems.push('id uses the reserved `epic` role segment');
    if (parts.roundId !== roundId) problems.push(`id names round \`${parts.roundId}\`, not this round \`${roundId}\``);
  }
  const missing = FINDING_REQUIRED.filter((k) => isBlank(raw[k]));
  if (missing.length) problems.push(`missing required field(s): ${missing.join(', ')}`);
  const unknown = Object.keys(raw).filter((k) => !FINDING_KNOWN.has(k));
  if (unknown.length) problems.push(`unknown field(s): ${unknown.join(', ')}`);
  const notString = FINDING_STRING.filter((k) => !isBlank(raw[k]) && typeof raw[k] !== 'string');
  if (notString.length) problems.push(`non-string field(s): ${notString.join(', ')}`);
  if (!isBlank(raw.priority) && !PRIORITIES.has(raw.priority)) {
    problems.push(`priority \`${raw.priority}\` is not one of ${[...PRIORITIES].join(' | ')}`);
  }
  if (!isBlank(raw.kind) && raw.kind !== 'issue') problems.push(`kind \`${raw.kind}\` is not \`issue\``);
  if (!isBlank(raw.status) && raw.status !== 'open') problems.push(`status \`${raw.status}\` is not \`open\` (a new finding opens open)`);
  if (!isBlank(raw.lastConfirmedCommit) && typeof raw.lastConfirmedCommit !== 'string') problems.push('lastConfirmedCommit is not a string');
  if (!isBlank(raw.locations) && !Array.isArray(raw.locations)) problems.push('locations is not an array');
  if (!isBlank(raw.relatedIssues) && !Array.isArray(raw.relatedIssues)) problems.push('relatedIssues is not an array');
  return problems;
}

const FINDINGS_FILE_KEYS = new Set(['new', 'reconcile']);
// Retired: the role is the id's segment. Still emitted by pre-gate reviewers, so tolerated with a warning.
const FINDINGS_FILE_RETIRED_KEYS = new Set(['role']);

/** Every way a findings FILE fails `{ new: [], reconcile: [] }`; empty when it conforms. */
function findingsFileProblems(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['root is not a JSON object'];
  const problems = [];
  for (const k of FINDINGS_FILE_KEYS) {
    if (data[k] === undefined) problems.push(`missing \`${k}\` array`);
    else if (!Array.isArray(data[k])) problems.push(`\`${k}\` is not an array`);
  }
  const unknown = Object.keys(data).filter((k) => !FINDINGS_FILE_KEYS.has(k) && !FINDINGS_FILE_RETIRED_KEYS.has(k));
  if (unknown.length) problems.push(`unknown key(s): ${unknown.join(', ')}`);
  return problems;
}

/**
 * Gate the findings files against the documented contract before any write: each file is
 * `{ new: Issue[], reconcile: Reconcile[] }` and nothing else, and each `new` finding matches
 * the Issue interface (issue-format.md). Every problem is reported at once, with the file it
 * came from. A malformed finding the verifier ACCEPTED would be written, so it throws; one the
 * verifier REJECTED is never written, so it is returned as a warning rather than halting the
 * round -- but never dropped silently (#swe-errors). A malformed FILE throws regardless: none
 * of its findings can be trusted to have reached the verifier.
 * A file that still carries the retired `role` key is warned about, not refused: every pre-gate
 * round emitted it, and failing the round would discard the other lenses' findings.
 * @param {Array<{ file: string, data: { new?: unknown[] } }>} named  findings files, by name
 * @param {{ roundId: string, accepted: Set<string>, judged: Set<string> }} ctx  verdict ids: accepted, and all
 * @returns {string[]} warnings: malformed findings that were rejected or never verified, and retired keys
 */
export function assertFindings(named, { roundId, accepted, judged }) {
  const errors = [];
  const warnings = [];
  for (const { file, data } of named) {
    const fileProblems = findingsFileProblems(data);
    if (fileProblems.length) {
      errors.push(`findings/${file}: ${fileProblems.join('; ')} (expected { new: Issue[], reconcile: Reconcile[] })`);
      continue;
    }
    for (const k of FINDINGS_FILE_RETIRED_KEYS) {
      if (k in data) warnings.push(`findings/${file}: carries a \`${k}\` key, which nothing reads -- the role is the id's segment`);
    }
    data.new.forEach((raw, i) => {
      const problems = findingProblems(raw, roundId);
      if (!problems.length) return;
      const id = raw?.id;
      const line = `finding findings/${file} new[${i}] (id \`${id}\`): ${problems.join('; ')}`;
      if (accepted.has(id)) errors.push(line);
      else warnings.push(`${judged.has(id) ? 'rejected' : 'unverified'} ${line}`);
    });
  }
  if (errors.length) {
    throw new Error(`findings do not match issue-format.md -- ${errors.join(' | ')}`);
  }
  return warnings;
}

// pm-directive.json (issue-format.md): every section the PM may emit, and what each entry needs.
const DIRECTIVE_SECTIONS = new Set(['epics', 'priorityOverrides', 'duplicates', 'rejections']);
const DIRECTIVE_ENTRY_REQUIRED = {
  epics: ['id', 'title'],
  priorityOverrides: ['id', 'priority', 'rationale'],
  duplicates: ['id', 'canonical'],
  rejections: ['id'],
};

/**
 * Throw unless the PM directive is well-formed, before any write: known sections only, an epic
 * id that parses with the `epic` role for THIS round, required entry fields present, and
 * priorities in band. applyEpics runs after issues are written, so it relies on this gate.
 * @param {unknown} directive
 * @param {{ roundId: string, source: string }} ctx
 */
export function assertDirective(directive, { roundId, source }) {
  if (!directive || typeof directive !== 'object' || Array.isArray(directive)) {
    throw new Error(`PM directive (${source}) is not a JSON object`);
  }
  const problems = [];
  const unknown = Object.keys(directive).filter((k) => !DIRECTIVE_SECTIONS.has(k));
  if (unknown.length) problems.push(`unknown section(s): ${unknown.join(', ')}`);
  for (const section of DIRECTIVE_SECTIONS) {
    const entries = directive[section];
    if (entries === undefined) continue;
    if (!Array.isArray(entries)) { problems.push(`${section} is not an array`); continue; }
    entries.forEach((e, i) => {
      const at = `${section}[${i}]`;
      if (!e || typeof e !== 'object') { problems.push(`${at} is not an object`); return; }
      const missing = DIRECTIVE_ENTRY_REQUIRED[section].filter((k) => isBlank(e[k]));
      if (missing.length) problems.push(`${at} missing required field(s): ${missing.join(', ')}`);
      if (!isBlank(e.priority) && !PRIORITIES.has(e.priority)) problems.push(`${at} priority \`${e.priority}\` is not one of ${[...PRIORITIES].join(' | ')}`);
      if (section === 'epics' && !isBlank(e.id)) {
        const parts = parseId(e.id);
        if (!parts) problems.push(`${at} id \`${e.id}\` is malformed (expected \`<roundId>#epic-<n>\`)`);
        else {
          if (parts.role !== 'epic') problems.push(`${at} id \`${e.id}\` does not use the \`epic\` role segment`);
          if (parts.roundId !== roundId) problems.push(`${at} id names round \`${parts.roundId}\`, not this round \`${roundId}\``);
        }
        if (!isBlank(e.children) && !Array.isArray(e.children)) problems.push(`${at} children is not an array`);
      }
    });
  }
  if (problems.length) throw new Error(`PM directive (${source}) does not match issue-format.md -- ${problems.join('; ')}`);
}

// Reconcile transitions a reviewer may emit on a dirty prior issue (issue-format.md).
const RECONCILE_TRANSITIONS = new Set(['fixed', 'deprecated', 'superseded', 'reopen', 'still-open']);

/**
 * Throw unless every reconcile entry names an issue that exists in the store and a known
 * transition, before any write. An entry that cannot be applied is an error, never a skip:
 * a skipped transition leaves the issue the reviewer meant to close open (#swe-errors).
 * @param {Array<{ file: string, data: { reconcile?: unknown[] } }>} named
 * @param {Map<string, unknown>} index  the store index (issue id -> record)
 */
export function assertReconcile(named, index) {
  const problems = [];
  const seen = new Map(); // issue id -> the entry that first reconciled it this round
  for (const { file, data } of named) {
    (data?.reconcile || []).forEach((rc, i) => {
      const at = `findings/${file} reconcile[${i}]`;
      if (!rc || typeof rc !== 'object') { problems.push(`${at} is not an object`); return; }
      if (isBlank(rc.id)) problems.push(`${at} is missing id`);
      else if (!index.has(rc.id)) problems.push(`${at} names \`${rc.id}\`, which is not in the store`);
      else if (seen.has(rc.id)) problems.push(`${at} reconciles \`${rc.id}\` twice this round (first in ${seen.get(rc.id)}); one lens owns a transition`);
      else seen.set(rc.id, at);
      if (isBlank(rc.transition)) problems.push(`${at} is missing transition`);
      else if (!RECONCILE_TRANSITIONS.has(rc.transition)) {
        problems.push(`${at} transition \`${rc.transition}\` is not one of ${[...RECONCILE_TRANSITIONS].join(' | ')}`);
      }
    });
  }
  if (problems.length) throw new Error(`reconcile entries do not match issue-format.md -- ${problems.join('; ')}`);
}

// ---------- apply ----------

/**
 * Read and gate the scratch both `summary` and `apply` consume -- round record, verdicts,
 * findings files, reconcile entries -- so the two steps refuse the same input and the reduce
 * never runs on scratch that apply will reject. Throws before anything is written.
 * @param {{ store: string, roundId: string, scratch: string }} input
 */
function gateScratch({ store, roundId, scratch }) {
  const roundPath = join(scratch, 'round.json');
  const round = readJson(roundPath);
  assertRoundRecord(round, roundPath);
  if (round.id !== roundId) {
    throw new Error(`round record (${roundPath}) is for round \`${round.id}\`, but round \`${roundId}\` is being persisted`);
  }
  const verdicts = readDirJson(join(scratch, 'verdicts'));
  const accepted = new Set(verdicts.filter((v) => v.verdict === 'accept').map((v) => v.id));
  const judged = new Set(verdicts.map((v) => v.id));
  const namedFindings = readDirJsonNamed(join(scratch, 'findings'));
  const warnings = assertFindings(namedFindings, { roundId, accepted, judged });
  assertReconcile(namedFindings, indexStore(store));
  return { round, accepted, findings: namedFindings.map((n) => n.data), warnings };
}

/**
 * Write the store for a round from its JSON scratch. Never throws on store
 * content; throws only on malformed/unreadable scratch (fail closed before any write).
 * @param {{ store: string, roundId: string, scratchDir?: string }} input
 * @returns {{ written: string[], errors: string[], warnings: string[], counts: { issues: number, epics: number, rounds: number } }}
 */
export function persistApply({ store, roundId, scratchDir }) {
  const scratch = scratchDir || defaultScratchDir(store, roundId);
  const { round, accepted, findings, warnings: findingWarnings } = gateScratch({ store, roundId, scratch });
  const directivePath = join(scratch, 'pm-directive.json');
  const directive = existsSync(directivePath) ? readJson(directivePath) : {};
  assertDirective(directive, { roundId, source: directivePath });
  const pmRejected = new Set((directive.rejections || []).map((r) => r.id));
  const priorityOf = new Map((directive.priorityOverrides || []).map((p) => [p.id, p]));
  const dupOf = new Map((directive.duplicates || []).map((d) => [d.id, d]));

  const written = [];

  // 1) Verified-new issues.
  for (const f of findings) {
    for (const raw of f.new || []) {
      if (!accepted.has(raw.id) || pmRejected.has(raw.id)) continue;
      const roleDir = roleOf(raw.id);
      const issue = {
        ...raw,
        kind: 'issue',
        lastConfirmedCommit: raw.lastConfirmedCommit || round.baselineCommit,
      };
      const po = priorityOf.get(issue.id);
      if (po) {
        issue.priority = po.priority;
        issue.priorityRationale = po.rationale;
      }
      const dup = dupOf.get(issue.id);
      if (dup) {
        issue.status = 'duplicated';
        issue.closingComments = dup.comment || `duplicate of ${dup.canonical}`;
        issue.closedInRound = round.id;
        issue.relatedIssues = [...(issue.relatedIssues || []), { issueId: dup.canonical, description: 'duplicate-of' }];
        const p = issuePath(store, roleDir, 'closed', issue);
        writeJson(p, issue);
        written.push(p);
      } else {
        issue.status = 'open';
        const p = issuePath(store, roleDir, 'open', issue);
        writeJson(p, issue);
        written.push(p);
      }
    }
  }

  // 2) Reconcile transitions (Task 4 fills this in).
  applyReconcile({ store, round, findings, written });

  // 3) Epics (Task 5 fills this in).
  applyEpics({ store, round, directive, written });

  // 4) Round file.
  const roundPath = join(store, 'rounds', `${round.id}.json`);
  writeJson(roundPath, round);
  written.push(roundPath);

  // 5) Validate.
  const { errors, warnings } = lintStore({ root: store });
  return { written, errors, warnings: [...findingWarnings, ...warnings], counts: countWritten({ store, written }) };
}

// Tally what reached the store, by partition. Reported unconditionally (zeros
// included) so a round that persisted NOTHING says so in the transcript, rather
// than looking identical to a successful one and having to be inferred by
// inspecting the store afterwards.
function countWritten({ store, written }) {
  const counts = { issues: 0, epics: 0, rounds: 0 };
  // Match on the partition root plus a separator, never the bare prefix: a future
  // sibling like `issues-archive/` would otherwise be counted as `issues/`.
  const partitions = Object.keys(counts).map((name) => [name, resolve(join(store, name)) + sep]);
  // A path may be written more than once in a round (an issue re-placed by
  // reconcile); count files, not writes.
  for (const p of new Set(written.map((w) => resolve(w)))) {
    const hit = partitions.find(([, root]) => p.startsWith(root));
    if (hit) counts[hit[0]] += 1;
  }
  return counts;
}

const CLOSING = new Set(['fixed', 'deprecated', 'superseded']);

// Apply reconcile transitions to existing issue files; move files to match the
// new status placement. `written` accumulates touched paths for reporting.
function applyReconcile({ store, round, findings, written }) {
  const index = indexStore(store);
  for (const f of findings) {
    for (const rc of f.reconcile || []) {
      const rec = index.get(rc.id); // present: assertReconcile ran before any write
      const issue = rec.obj;

      if (CLOSING.has(rc.transition)) {
        issue.status = rc.transition;
        issue.closingComments = rc.closingComments || `${rc.transition} in round ${round.id}`;
        issue.closedInRound = round.id;
        if (rc.relatedIssues) issue.relatedIssues = rc.relatedIssues;
        moveIssue(rec, store, rec.roleDir, 'closed', issue, written);
      } else if (rc.transition === 'reopen') {
        issue.status = 'open';
        delete issue.closingComments;
        delete issue.closedInRound;
        moveIssue(rec, store, rec.roleDir, 'open', issue, written);
      } else if (rc.transition === 'still-open') {
        issue.status = 'open';
        if (rc.locations) issue.locations = rc.locations;
        issue.lastConfirmedCommit = round.baselineCommit;
        moveIssue(rec, store, rec.roleDir, 'open', issue, written);
      }
    }
  }
}

// Write the issue at its new placement and remove the old file if the path changed.
function moveIssue(rec, store, roleDir, placement, issue, written) {
  const target = issuePath(store, roleDir, placement, issue);
  writeJson(target, issue);
  written.push(target);
  if (resolve(rec.absPath) !== resolve(target) && existsSync(rec.absPath)) {
    rmSync(rec.absPath);
  }
}

// Write canonical epic files from the PM directive. An epic links its children
// via relatedIssues; only children that actually exist in the store are linked
// (a child the PM rejected, a verifier dropped, or mistyped would otherwise
// dangle and fail lint). Runs after issues are written + reconciled, so walking
// issues/ yields every id that will exist.
function applyEpics({ store, round, directive, written }) {
  const known = new Set();
  walk(join(store, 'issues'), (abs) => known.add(readJson(abs).id));
  for (const e of directive.epics || []) {
    const epic = {
      id: e.id,
      kind: 'epic',
      title: e.title,
      description: e.description || e.title,
      priority: e.priority || 'medium',
      priorityRationale: e.priorityRationale || 'rollup',
      status: 'open',
      lastConfirmedCommit: round.baselineCommit,
      relatedIssues: (e.children || [])
        .filter((issueId) => known.has(issueId))
        .map((issueId) => ({ issueId, description: 'parent-of' })),
    };
    const p = join(store, 'epics', `${idToSafe(epic.id)}-${slugify(epic.title)}.json`);
    writeJson(p, epic);
    written.push(p);
  }
}

// ---------- summary (Task 7) ----------

const summarize = (o, role) => ({ id: o.id, title: o.title, priority: o.priority, role, status: o.status || 'open', kind: o.kind || 'issue' });

/**
 * Project the PM's input: carried-forward OPEN issues (from the store) plus this
 * round's accepted new findings (scratch minus rejects). Writes pm-input.json.
 * @param {{ store: string, roundId: string, scratchDir?: string }} input
 * @returns {{ roundId: string, carried: object[], new: object[], warnings: string[] }}
 */
export function persistSummary({ store, roundId, scratchDir }) {
  const scratch = scratchDir || defaultScratchDir(store, roundId);
  const { accepted, findings, warnings } = gateScratch({ store, roundId, scratch });

  const carried = [];
  walk(join(store, 'issues'), (abs) => {
    const relParts = abs.slice(join(store, 'issues').length + 1).split(/[\\/]/);
    if (relParts.includes('closed') || relParts.includes('promoted')) return; // open only
    const o = readJson(abs);
    if (o.status === 'open') carried.push(summarize(o, relParts[0]));
  });

  const fresh = [];
  for (const f of findings) {
    for (const n of f.new || []) {
      if (accepted.has(n.id)) fresh.push(summarize(n, roleOf(n.id)));
    }
  }

  const out = { roundId, carried, new: fresh };
  writeJson(join(scratch, 'pm-input.json'), out);
  return { ...out, warnings };
}

// ---------- CLI ----------

const invokedDirectly = isMain(import.meta.url, argv[1]);
if (invokedDirectly) {
  const [cmd, storeArg, roundId] = argv.slice(2);
  const store = resolve(storeArg || '');
  try {
    if (cmd === 'apply') {
      const { errors, warnings, counts } = persistApply({ store, roundId });
      for (const w of warnings) stderr.write(`warning: ${w}\n`);
      for (const e of errors) stderr.write(`error: ${e}\n`);
      // Always states what reached the store, zeros included: an empty store must be
      // readable off this line, not inferred by going and looking at the store.
      stdout.write(
        `review-board persist apply: wrote ${counts.issues} issue(s), ${counts.epics} epic(s), ` +
          `${counts.rounds} round record(s) to ${store} -- ` +
          `${warnings.length} warning(s), ${errors.length} error(s)\n`,
      );
      if (errors.length) exit(1);
    } else if (cmd === 'summary') {
      const { warnings } = persistSummary({ store, roundId });
      for (const w of warnings) stderr.write(`warning: ${w}\n`);
      stdout.write(`review-board persist summary: ok -- ${warnings.length} warning(s)\n`);
    } else {
      stderr.write('usage: persist.mjs <summary|apply> <store-dir> <round-id>\n');
      exit(2);
    }
  } catch (err) {
    stderr.write(`error: ${err.message}\n`);
    exit(1);
  }
}
