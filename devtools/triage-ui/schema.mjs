/**
 * Schema, validation, and canonical serialization for the instruction-review
 * triage worksheet `triage.json` (see docs/working-specs/2026-06-17-triage-ui/).
 *
 * Dev-only: lives outside `tools/<ai>/` so it is never installed into a
 * consumer's `.claude/**`, and outside `package.json` `files` so it is never
 * published. Zero dependencies -- Node built-ins only.
 *
 * The TypeScript contract this mirrors:
 *   Kind    = 'new-rule' | 'strengthen' | 'rehome' | 'reowner'
 *   Verdict = 'park' | 'adopt' | 'reject' | 'fold' | 'defer' | 'refine'
 *   Status  = {state:'ready'} | {state:'blocked',blockedOn} | {state:'conditional',blockedOn}
 *   Decision= {verdict:'park',details?} | {verdict:'adopt',details?}
 *           | {verdict:'reject',details} | {verdict:'fold',foldTarget,details}
 *           | {verdict:'defer',details} | {verdict:'refine',details}
 *   EntryBase { tag, role, targetFile, status, gap, decision, applyLog[] }
 *   + per-kind: new-rule{draft} strengthen{current,draft}
 *               rehome{proposedFile,current?,draft?} reowner{proposedOwner}
 *   TriageFile { round, entries[] }
 */

import { createHash } from 'node:crypto';

export const KINDS = ['new-rule', 'strengthen', 'rehome', 'reowner'];
export const VERDICTS = ['park', 'adopt', 'reject', 'fold', 'defer', 'refine'];
export const STATES = ['ready', 'blocked', 'conditional'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';
const nonEmpty = (v) => isStr(v) && v.trim() !== '';

/**
 * Validate a single entry's structure. Returns an array of problem strings
 * (empty == valid). Pure; no cross-reference resolution (see validateCrossRefs).
 */
export function validateEntry(entry, where = 'entry') {
  const p = [];
  if (!isObj(entry)) return [`${where}: not an object`];

  const tag = entry.tag;
  const at = nonEmpty(tag) ? `entry "${tag}"` : where;

  if (!nonEmpty(tag)) p.push(`${at}: missing/empty "tag"`);
  if (!nonEmpty(entry.role)) p.push(`${at}: missing/empty "role"`);
  if (!nonEmpty(entry.targetFile)) p.push(`${at}: missing/empty "targetFile"`);
  if (!nonEmpty(entry.gap)) p.push(`${at}: missing/empty "gap"`);
  if (!Array.isArray(entry.applyLog) || !entry.applyLog.every(isStr)) {
    p.push(`${at}: "applyLog" must be a string[]`);
  }

  // status (discriminated on state)
  const s = entry.status;
  if (!isObj(s) || !STATES.includes(s.state)) {
    p.push(`${at}: "status.state" must be one of ${STATES.join('|')}`);
  } else if (s.state === 'ready') {
    if ('blockedOn' in s && s.blockedOn !== undefined) {
      p.push(`${at}: "status.blockedOn" not allowed when state is ready`);
    }
  } else if (!nonEmpty(s.blockedOn)) {
    p.push(`${at}: "status.blockedOn" required when state is ${s.state}`);
  }

  // decision (discriminated on verdict)
  const d = entry.decision;
  if (!isObj(d) || !VERDICTS.includes(d.verdict)) {
    p.push(`${at}: "decision.verdict" must be one of ${VERDICTS.join('|')}`);
  } else {
    if (['reject', 'defer', 'refine', 'fold'].includes(d.verdict) && !nonEmpty(d.details)) {
      p.push(`${at}: "decision.details" required for verdict ${d.verdict}`);
    }
    if (d.verdict === 'fold' && !nonEmpty(d.foldTarget)) {
      p.push(`${at}: "decision.foldTarget" required for verdict fold`);
    }
    if (d.verdict !== 'fold' && 'foldTarget' in d && d.foldTarget !== undefined) {
      p.push(`${at}: "decision.foldTarget" only allowed for verdict fold`);
    }
    if (['adopt', 'park'].includes(d.verdict) && 'details' in d && d.details !== undefined) {
      p.push(`${at}: "decision.details" not allowed for verdict ${d.verdict}`);
    }
  }

  if ('lastRoundReply' in entry && entry.lastRoundReply !== undefined && !isStr(entry.lastRoundReply)) {
    p.push(`${at}: "lastRoundReply" must be a string`);
  }

  // kind + per-kind required fields
  if (!KINDS.includes(entry.kind)) {
    p.push(`${at}: "kind" must be one of ${KINDS.join('|')}`);
  } else {
    switch (entry.kind) {
      case 'new-rule':
        if (!nonEmpty(entry.draft)) p.push(`${at}: new-rule requires "draft"`);
        if (entry.current !== undefined) p.push(`${at}: new-rule must not carry "current"`);
        break;
      case 'strengthen':
        if (!nonEmpty(entry.draft)) p.push(`${at}: strengthen requires "draft"`);
        break;
      case 'rehome':
        if (!nonEmpty(entry.proposedFile)) p.push(`${at}: rehome requires "proposedFile"`);
        break;
      case 'reowner':
        if (!nonEmpty(entry.proposedOwner)) p.push(`${at}: reowner requires "proposedOwner"`);
        break;
    }
  }

  return p;
}

/** Validate the whole file structure (excludes cross-references). */
export function validateFile(file) {
  const p = [];
  if (!isObj(file)) return ['file: not an object'];
  if (!nonEmpty(file.round)) p.push('file: missing/empty "round"');
  if (!Array.isArray(file.entries)) {
    p.push('file: "entries" must be an array');
    return p;
  }
  const seen = new Set();
  file.entries.forEach((e, i) => {
    p.push(...validateEntry(e, `entries[${i}]`));
    if (isObj(e) && nonEmpty(e.tag)) {
      if (seen.has(e.tag)) p.push(`entry "${e.tag}": duplicate tag`);
      seen.add(e.tag);
    }
  });
  return p;
}

/**
 * Cross-reference checks structural typing can't express. Caller supplies the
 * live tag set and the resolvable-owner set (from `node bin/cli.js --stdout`
 * and roles.yaml), keeping this pure/testable.
 */
export function validateCrossRefs(file, { liveTags = [], resolvableOwners = [] } = {}) {
  const p = [];
  const tags = new Set(liveTags);
  const owners = new Set(resolvableOwners);
  if (!isObj(file) || !Array.isArray(file.entries)) return p;
  for (const e of file.entries) {
    if (!isObj(e)) continue;
    const at = nonEmpty(e.tag) ? `entry "${e.tag}"` : 'entry';
    const d = e.decision;
    if (isObj(d) && d.verdict === 'fold' && nonEmpty(d.foldTarget) && !tags.has(d.foldTarget)) {
      p.push(`${at}: fold target "${d.foldTarget}" is not a live #tag`);
    }
    if (e.kind === 'reowner' && nonEmpty(e.proposedOwner) && !owners.has(e.proposedOwner)) {
      p.push(`${at}: proposedOwner "${e.proposedOwner}" is not a resolvable owner`);
    }
  }
  return p;
}

/** Recursively sort object keys for a deterministic serialization. */
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (isObj(v)) {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}

/**
 * The single canonical serializer both the UI server and (ideally)
 * /instruction-apply write with: sorted keys, 2-space indent, trailing newline.
 */
export function canonicalJSON(obj) {
  return JSON.stringify(sortKeys(obj), null, 2) + '\n';
}

/**
 * Conflict-detection token: sha256 over the canonical form of the parsed
 * content, so a reformat/key-reorder does not spuriously change it while any
 * content change does. Throws if the text is not valid JSON.
 */
export function versionToken(fileText) {
  const parsed = JSON.parse(fileText);
  return createHash('sha256').update(canonicalJSON(parsed)).digest('hex');
}

/** Bring a pre-v2 worksheet object to v2: drop `current`, drop adopt/park details. Idempotent. */
export function migrateWorksheet(file) {
  if (!isObj(file) || !Array.isArray(file.entries)) return file;
  const entries = file.entries.map((e) => {
    if (!isObj(e)) return e;
    const { current, ...rest } = e;
    const d = rest.decision;
    if (isObj(d) && ['adopt', 'park'].includes(d.verdict) && 'details' in d) {
      const { details, ...dr } = d;
      rest.decision = dr;
    }
    return rest;
  });
  return { ...file, entries };
}
