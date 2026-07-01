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
export const PRIORITIES = ['high', 'medium', 'low'];
export const CANDIDATE_VERDICTS = ['park', 'wanted', 'reject'];
export const SCORECARD_VERDICTS = ['strong', 'good', 'weak', 'gaps'];

export const SCORECARD_RANK = { strong: 0, good: 1, weak: 2, gaps: 3 };

/**
 * Worst verdict among an ALREADY-FILTERED finding list, 'strong' when empty.
 * The caller filters by (dimension, lens) first — deriveVerdict does not filter.
 */
export function deriveVerdict(filteredFindings) {
  let worst = 0;
  for (const f of filteredFindings || []) {
    const r = SCORECARD_RANK[f && f.verdict];
    if (r > worst) worst = r;
  }
  return SCORECARD_VERDICTS[worst];
}

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

  // owner: the tag's suggested ownership row (new-rule), editable in the UI and
  // written to ownership.yaml by /instruction-apply. Optional; apply falls back to
  // `role`. Resolvability is enforced by the ownership-coverage CI gate at adopt.
  if ('owner' in entry && entry.owner !== undefined && !nonEmpty(entry.owner)) {
    p.push(`${at}: "owner" must be a non-empty string`);
  }
  // priority: carried from the candidate on promotion so apply can sequence work
  // without re-deriving it. Optional (legacy entries have none).
  if ('priority' in entry && entry.priority !== undefined && !PRIORITIES.includes(entry.priority)) {
    p.push(`${at}: "priority" must be one of ${PRIORITIES.join('|')}`);
  }

  // kind + per-kind required fields
  if (!KINDS.includes(entry.kind)) {
    p.push(`${at}: "kind" must be one of ${KINDS.join('|')}`);
  } else {
    switch (entry.kind) {
      case 'new-rule':
        if (!nonEmpty(entry.draft)) p.push(`${at}: new-rule requires "draft"`);
        if (entry.current !== undefined) p.push(`${at}: new-rule must not carry "current"`);
        // One-tag-per-file: a new rule gets its OWN file. A targetFile whose basename
        // isn't <tag>.md points at an existing rule's file — a whole-file adopt would
        // overwrite that rule and orphan its ownership row (the swe-security clobber).
        if (nonEmpty(entry.tag) && nonEmpty(entry.targetFile)) {
          const bare = entry.tag.replace(/^#+/, '');
          const base = entry.targetFile.split('/').pop();
          if (base !== `${bare}.md`) {
            p.push(`${at}: new-rule targetFile basename "${base}" must be "${bare}.md" (a new rule gets its own file; this points at an existing rule)`);
          }
        }
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

/** Validate one candidate (a draft-less, surfaced proposal). Returns problem strings. */
export function validateCandidate(c, where = 'candidate') {
  const p = [];
  if (!isObj(c)) return [`${where}: not an object`];
  const at = nonEmpty(c.tag) ? `candidate "${c.tag}"` : where;
  if (!nonEmpty(c.tag)) p.push(`${at}: missing/empty "tag"`);
  if (!nonEmpty(c.role)) p.push(`${at}: missing/empty "role"`);
  if (!nonEmpty(c.targetFile)) p.push(`${at}: missing/empty "targetFile"`);
  if (!nonEmpty(c.gap)) p.push(`${at}: missing/empty "gap"`);
  if (!KINDS.includes(c.kind)) p.push(`${at}: "kind" must be one of ${KINDS.join('|')}`);
  if (!PRIORITIES.includes(c.priority)) p.push(`${at}: "priority" must be one of ${PRIORITIES.join('|')}`);
  // owner: suggested ownership.yaml owner for a new-rule candidate; carried onto
  // the entry on promotion (with priority) so nothing is re-derived. Optional.
  if ('owner' in c && c.owner !== undefined && !nonEmpty(c.owner)) p.push(`${at}: "owner" must be a non-empty string`);
  if ('draft' in c) p.push(`${at}: a candidate must not carry "draft"`);
  const d = c.decision;
  if (!isObj(d) || !CANDIDATE_VERDICTS.includes(d.verdict)) {
    p.push(`${at}: "decision.verdict" must be one of ${CANDIDATE_VERDICTS.join('|')}`);
  } else if ('details' in d && d.details !== undefined && !isStr(d.details)) {
    // details is a free-text note on any candidate verdict: reject reason,
    // drafting guidance for a wanted candidate, or a park reminder.
    p.push(`${at}: "decision.details" must be a string`);
  }
  return p;
}

/** Validate the scorecard (null allowed). Enforces matrix alignment; dimension names are open. */
export function validateScorecard(sc, where = 'scorecard') {
  if (sc === null || sc === undefined) return [];
  const p = [];
  if (!isObj(sc)) return [`${where}: must be an object or null`];
  const okLenses = Array.isArray(sc.lenses) && sc.lenses.every(isStr);
  if (!okLenses) p.push(`${where}: "lenses" must be a string[]`);
  const lenses = okLenses ? sc.lenses : [];
  const checkVerdict = (v, w) => {
    if (!SCORECARD_VERDICTS.includes(v)) p.push(`${w}: verdict must be one of ${SCORECARD_VERDICTS.join('|')}`);
  };
  if (!Array.isArray(sc.perLens)) p.push(`${where}: "perLens" must be an array`);
  else sc.perLens.forEach((row, i) => {
    const rw = `${where}.perLens[${i}]`;
    if (!isObj(row) || !nonEmpty(row.dimension)) { p.push(`${rw}: missing "dimension"`); return; }
    if (!Array.isArray(row.cells)) { p.push(`${rw}: "cells" must be an array`); return; }
    if (row.cells.length !== lenses.length) p.push(`${rw}: cells.length (${row.cells.length}) != lenses.length (${lenses.length})`);
    row.cells.forEach((cell, j) => {
      if (!isObj(cell)) { p.push(`${rw}.cells[${j}]: not an object`); return; }
      if (lenses[j] !== undefined && cell.lens !== lenses[j]) p.push(`${rw}.cells[${j}]: lens "${cell.lens}" != lenses[${j}]`);
      checkVerdict(cell.verdict, `${rw}.cells[${j}]`);
    });
  });
  if (!Array.isArray(sc.global)) p.push(`${where}: "global" must be an array`);
  else sc.global.forEach((row, i) => {
    const rw = `${where}.global[${i}]`;
    if (!isObj(row) || !nonEmpty(row.dimension)) p.push(`${rw}: missing "dimension"`);
    else checkVerdict(row.verdict, rw);
  });
  if (!Array.isArray(sc.details)) p.push(`${where}: "details" must be an array`);
  else sc.details.forEach((f, i) => {
    if (!isObj(f) || !nonEmpty(f.dimension) || !nonEmpty(f.file) || !nonEmpty(f.tag) || !nonEmpty(f.note)) {
      p.push(`${where}.details[${i}]: needs dimension/file/tag/note`);
    } else if (!SCORECARD_VERDICTS.includes(f.verdict)) {
      p.push(`${where}.details[${i}]: "verdict" must be one of ${SCORECARD_VERDICTS.join('|')}`);
    }
  });
  // Equality enforcement (net-new): each stored cell/global verdict must equal the
  // worst of its matching findings (else 'strong'). Loose `== null` for the global
  // match because a migrated global finding has no `lens` key (f.lens === undefined).
  const findings = Array.isArray(sc.details) ? sc.details.filter(isObj) : [];
  const matching = (dim, lens) => findings.filter((f) =>
    f.dimension === dim && (lens == null ? f.lens == null : f.lens === lens));
  if (Array.isArray(sc.perLens)) sc.perLens.forEach((row, i) => {
    if (!isObj(row) || !Array.isArray(row.cells)) return;
    row.cells.forEach((cell, j) => {
      if (!isObj(cell) || !SCORECARD_VERDICTS.includes(cell.verdict)) return; // bad verdict already flagged
      const want = deriveVerdict(matching(row.dimension, cell.lens));
      if (cell.verdict !== want) {
        p.push(`${where}.perLens[${i}].cells[${j}]: verdict "${cell.verdict}" != derived "${want}" from its findings`);
      }
    });
  });
  if (Array.isArray(sc.global)) sc.global.forEach((row, i) => {
    if (!isObj(row) || !SCORECARD_VERDICTS.includes(row.verdict)) return;
    const want = deriveVerdict(matching(row.dimension, null));
    if (row.verdict !== want) {
      p.push(`${where}.global[${i}]: verdict "${row.verdict}" != derived "${want}" from its findings`);
    }
  });
  // A nit is a string (legacy) or { text, fix?: 'auto' }. `fix:'auto'` flags it
  // for the /instruction-apply agent to fix; absence means the human fixes it.
  if (!Array.isArray(sc.nits)) {
    p.push(`${where}: "nits" must be an array`);
  } else {
    sc.nits.forEach((n, i) => {
      if (isStr(n)) return;
      if (!isObj(n) || !nonEmpty(n.text)) p.push(`${where}.nits[${i}]: must be a string or { text, fix? }`);
      else if ('fix' in n && n.fix !== undefined && n.fix !== 'auto') p.push(`${where}.nits[${i}]: "fix" must be "auto"`);
    });
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
  if ('scorecard' in file) p.push(...validateScorecard(file.scorecard, 'scorecard'));
  if ('candidates' in file) {
    if (!Array.isArray(file.candidates)) {
      p.push('file: "candidates" must be an array');
    } else {
      const cseen = new Set();
      file.candidates.forEach((c, i) => {
        p.push(...validateCandidate(c, `candidates[${i}]`));
        if (isObj(c) && nonEmpty(c.tag)) {
          if (cseen.has(c.tag)) p.push(`candidate "${c.tag}": duplicate tag`);
          cseen.add(c.tag);
          if (seen.has(c.tag)) p.push(`tag "${c.tag}": present in both entries and candidates`);
        }
      });
    }
  }
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

/** Look up a finding's cell/global verdict in the PRE-recompute stored matrix. */
function storedVerdict(sc, dim, lens) {
  if (lens == null) {
    const row = (Array.isArray(sc.global) ? sc.global : []).find((g) => isObj(g) && g.dimension === dim);
    return row && row.verdict;
  }
  const row = (Array.isArray(sc.perLens) ? sc.perLens : []).find((r) => isObj(r) && r.dimension === dim);
  const cell = row && Array.isArray(row.cells) ? row.cells.find((c) => isObj(c) && c.lens === lens) : null;
  return cell && cell.verdict;
}

/**
 * Bring a scorecard to canonical v-next form: (1) normalize lens:null->absent,
 * (2) default a missing finding verdict to its cell's stored verdict (else 'weak'),
 * (3) recompute every cell/global verdict from the findings. Idempotent.
 */
function migrateScorecard(sc) {
  if (!isObj(sc)) return sc;
  // 1 + 2: normalize lens, default verdict from the PRE-recompute stored matrix.
  const details = Array.isArray(sc.details) ? sc.details.map((f) => {
    if (!isObj(f)) return f;
    const g = { ...f };
    if (g.lens == null) delete g.lens;                 // null or undefined -> absent
    if (g.verdict == null) g.verdict = storedVerdict(sc, g.dimension, g.lens) ?? 'weak';
    return g;
  }) : sc.details;
  const live = Array.isArray(details) ? details.filter(isObj) : [];
  const matching = (dim, lens) => live.filter((f) =>
    f.dimension === dim && (lens == null ? f.lens == null : f.lens === lens));
  // 3: recompute cells + global from the now-verdict-bearing findings.
  const perLens = Array.isArray(sc.perLens) ? sc.perLens.map((row) =>
    (isObj(row) && Array.isArray(row.cells))
      ? { ...row, cells: row.cells.map((c) => isObj(c) ? { ...c, verdict: deriveVerdict(matching(row.dimension, c.lens)) } : c) }
      : row) : sc.perLens;
  const global = Array.isArray(sc.global) ? sc.global.map((row) =>
    isObj(row) ? { ...row, verdict: deriveVerdict(matching(row.dimension, null)) } : row) : sc.global;
  const nits = Array.isArray(sc.nits) ? sc.nits.map((n) => (isObj(n) ? n : { text: String(n) })) : sc.nits;
  return { ...sc, details, perLens, global, nits };
}

/** Bring a pre-v2/v3 worksheet object to v3 canonical form. Idempotent. */
export function migrateWorksheet(file) {
  if (!isObj(file)) return file;
  const entriesIn = Array.isArray(file.entries) ? file.entries : [];
  const entries = entriesIn.map((e) => {
    if (!isObj(e)) return e;
    // Drop `current` (review-surface, read live from disk) and `_live` (a
    // client-only cache the triage UI hangs on the object) so neither is
    // persisted into the worksheet.
    const { current, _live, ...rest } = e;
    const d = rest.decision;
    if (isObj(d) && ['adopt', 'park'].includes(d.verdict) && 'details' in d) {
      const { details, ...dr } = d;
      rest.decision = dr;
    }
    return rest;
  });
  const candidatesIn = Array.isArray(file.candidates) ? file.candidates : [];
  const candidates = candidatesIn.map((c) => {
    if (!isObj(c)) return c;
    const { _live, current, ...rest } = c; // same client-only transients
    return rest;
  });
  const scorecard = isObj(file.scorecard) ? migrateScorecard(file.scorecard) : (file.scorecard ?? null);
  return {
    ...file,
    scorecard,
    candidates,
    entries,
  };
}
