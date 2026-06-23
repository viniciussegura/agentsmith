import { lineDiff } from './diff.mjs';

const VERDICTS = ['park', 'adopt', 'reject', 'fold', 'defer', 'refine'];
const DETAIL_LABEL = {
  reject: 'Reason (required)', defer: 'Condition to adopt (required)',
  refine: 'Input / question (required)', fold: 'Reason (required)',
  park: 'Note (optional)', adopt: 'Note (optional)',
};
const NO_DETAILS_VERDICTS = new Set(['adopt', 'park']);
const ICON = { strong: '🟢', good: '🔵', weak: '🟡', gaps: '🔴' };
const SC_RANK = { strong: 0, good: 1, weak: 2, gaps: 3 }; // lower = better; for trend arrows
const PRI_RANK = { high: 0, medium: 1, low: 2 };
const CAND_NOTE_LABEL = { park: 'Note (optional)', wanted: 'Drafting note (optional)', reject: 'Reason (optional)' };

// view selects what the main pane shows: the scorecard, one proposal (entry), or
// one candidate. idx indexes entries[] (proposal) or sortedCandidates() (candidate).
const state = { data: { round: '', entries: [], candidates: [], scorecard: null }, prevScorecard: null, version: null, tags: [], view: { kind: 'empty', idx: 0 }, scFilter: null };
let saveTimer = null;

const $ = (sel) => document.querySelector(sel);
function el(tag, props = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(kids)) if (c) n.append(c);
  return n;
}

const sortedCandidates = () => [...(state.data.candidates || [])].sort((a, b) =>
  (PRI_RANK[a.priority] - PRI_RANK[b.priority]) || a.tag.toLowerCase().localeCompare(b.tag.toLowerCase()));
const decidedCount = () => state.data.entries.filter((e) => e.decision?.verdict && e.decision.verdict !== 'park').length;

async function load() {
  try {
    const t = await (await fetch('/api/triage')).json();
    state.data = t.data || { round: '', entries: [], candidates: [], scorecard: null };
    state.data.candidates = state.data.candidates ?? [];
    state.data.scorecard = state.data.scorecard ?? null;
    state.prevScorecard = t.prevScorecard ?? null;
    state.version = t.version;
    state.tags = (await (await fetch('/api/tags')).json()).tags || [];
    render();
  } catch (err) {
    // No backend (e.g. opened as a static file / IDE preview): show how to run it.
    $('#detail').replaceChildren(el('div', { class: 'empty' }, [
      el('p', { text: 'Could not reach the triage server.' }),
      el('p', { text: 'Run  npm run triage  and open the printed http://localhost URL.' }),
    ]));
    setSave('offline', 'err');
  }
}

function setSave(msg, cls = '') { const s = $('#save'); s.textContent = msg; s.className = `save ${cls}`; }

function scheduleSave() {
  clearTimeout(saveTimer);
  setSave('editing…');
  saveTimer = setTimeout(save, 600);
}

// Serialize saves: two PUTs racing with the same state.version would make the
// second 409 ("stale version"), forcing a load() that rebuilds the detail pane
// mid-edit — collapsing the draft editor and stealing focus. While one save is
// in flight, later requests set pendingSave and a single follow-up save runs
// (with the updated version) once it returns.
let saving = false;
let pendingSave = false;

async function save() {
  if (saving) { pendingSave = true; return; }
  saving = true;
  setSave('saving…');
  try {
    const res = await fetch('/api/triage', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: state.data, version: state.version }),
    });
    if (res.status === 200) { state.version = (await res.json()).version; setSave('saved', 'ok'); renderSidebar(); }
    else if (res.status === 423) { setSave('applying… will retry', 'err'); setTimeout(save, 1500); }
    else if (res.status === 409) { setSave('changed on disk — reloading', 'err'); await load(); }
    else { const b = await res.json(); setSave(`not saved: ${b.problems ? b.problems[0] : b.error}`, 'err'); }
  } finally {
    saving = false;
    if (pendingSave) { pendingSave = false; save(); }
  }
}

// --- selection / routing ---
function pickDefaultView() {
  if (state.data.scorecard) return { kind: 'scorecard', idx: 0 };
  if (state.data.entries.length) return { kind: 'proposal', idx: 0 };
  if (sortedCandidates().length) return { kind: 'candidate', idx: 0 };
  return { kind: 'empty', idx: 0 };
}
function viewValid() {
  const v = state.view;
  if (!v) return false;
  if (v.kind === 'scorecard' || v.kind === 'nits') return !!state.data.scorecard;
  if (v.kind === 'proposal') return v.idx < state.data.entries.length;
  if (v.kind === 'candidate') return v.idx < sortedCandidates().length;
  if (v.kind === 'empty') return !state.data.scorecard && !state.data.entries.length && !sortedCandidates().length;
  return false;
}
function select(kind, idx) {
  if (kind !== 'scorecard') state.scFilter = null;
  state.view = { kind, idx };
  renderSidebar();
  renderDetail();
}

// --- scorecard finding/nit presentation helpers ---
// Locate the proposal (entry) or candidate that would address a #tag, so a
// finding can link to the actionable item that fixes it.
function tagLocation(tag) {
  const ei = state.data.entries.findIndex((e) => e.tag === tag);
  if (ei >= 0) return { kind: 'proposal', idx: ei };
  const ci = sortedCandidates().findIndex((c) => c.tag === tag);
  if (ci >= 0) return { kind: 'candidate', idx: ci };
  return null;
}
// A #tag chip: clickable (jumps to the proposal/candidate) when one exists,
// otherwise a muted chip flagged "no proposal yet" — i.e. a gap to add one.
function tagChip(tag) {
  const loc = tagLocation(tag);
  if (loc) {
    return el('button', { class: 'chip chip-tag chip-link', title: `Go to ${loc.kind} #${tag}`, text: `#${tag}`, onclick: () => select(loc.kind, loc.idx) });
  }
  return el('span', { class: 'chip chip-tag chip-orphan', title: 'no proposal or candidate addresses this yet', text: `#${tag}` });
}
// Spin an orphan finding into a worksheet candidate (then jump to it). kind is
// inferred from whether the tag is already live (strengthen) or new (new-rule);
// role from the finding's lens (global findings default to the swe base lens).
function createCandidateFromFinding(d) {
  if (tagLocation(d.tag)) return; // already has a proposal/candidate
  const kind = state.tags.includes(`#${d.tag}`) ? 'strengthen' : 'new-rule';
  state.data.candidates.push({
    tag: d.tag,
    kind,
    role: d.lens || 'swe',
    targetFile: d.file || 'instructions/',
    gap: d.note || `From scorecard finding: ${d.dimension}${d.lens ? ' / ' + d.lens : ''}.`,
    priority: 'medium',
    decision: { verdict: 'park' },
  });
  const ci = sortedCandidates().findIndex((c) => c.tag === d.tag);
  select('candidate', ci);
  scheduleSave();
}

// "I fix": check off a mechanical nit (remove it once addressed). Nits are
// ephemeral round artifacts, so dismissing makes the list a working checklist.
function dismissNit(i) {
  state.data.scorecard.nits.splice(i, 1);
  renderNitsDetail();
  renderSidebar(); // keep the sidebar "Nits (N)" count in sync
  scheduleSave();
}
// "you fix": flag/unflag a nit for the /instruction-apply agent to fix.
function toggleNitFix(i) {
  const n = state.data.scorecard.nits[i];
  if (n.fix === 'auto') delete n.fix; else n.fix = 'auto';
  renderNitsDetail();
  scheduleSave();
}

// Inline-format free text: turn `code` spans and #tags into styled nodes; a #tag
// becomes an actionable chip when it resolves to a worksheet item.
function richText(s) {
  const nodes = [];
  const re = /(`[^`]+`)|(#[a-z][a-z0-9-]+)/gi;
  let last = 0; let m;
  while ((m = re.exec(s))) {
    if (m.index > last) nodes.push(document.createTextNode(s.slice(last, m.index)));
    if (m[1]) nodes.push(el('code', { class: 'inline-code', text: m[1].slice(1, -1) }));
    else nodes.push(tagChip(m[2].slice(1)));
    last = re.lastIndex;
  }
  if (last < s.length) nodes.push(document.createTextNode(s.slice(last)));
  return nodes;
}

function render() {
  if (!viewValid()) state.view = pickDefaultView();
  renderSidebar();
  renderDetail();
}

function renderSidebar() {
  const entries = state.data.entries;
  $('#counter').textContent = entries.length ? `${decidedCount()}/${entries.length} decided` : '';
  const v = state.view;
  const kids = [];

  if (state.data.scorecard) {
    const nitCount = state.data.scorecard.nits?.length || 0;
    kids.push(el('div', { class: 'sechead', text: 'Scorecard' }));
    kids.push(el('div', { class: `scitem ${v.kind === 'scorecard' ? 'active' : ''}`, onclick: () => select('scorecard', 0) },
      [el('span', { text: '▤ Scorecard' })]));
    kids.push(el('div', { class: `scitem ${v.kind === 'nits' ? 'active' : ''}`, onclick: () => select('nits', 0) },
      [el('span', { text: `🤖 Nits (${nitCount})` })]));
  }

  kids.push(el('div', { class: 'sechead', text: `Proposals (${entries.length})` }));
  entries.forEach((e, i) => {
    const ver = e.decision?.verdict || 'park';
    kids.push(el('div', { class: `row ${v.kind === 'proposal' && v.idx === i ? 'active' : ''}`, onclick: () => select('proposal', i) }, [
      el('span', { class: 'tag', text: `#${e.tag}` }),
      el('span', { class: 'kind', text: e.kind }),
      el('span', { class: `badge ${ver}`, text: ver }),
    ]));
  });

  const cs = sortedCandidates();
  kids.push(el('div', { class: 'sechead', text: `Candidates (${cs.length})` }));
  cs.forEach((c, i) => {
    const ver = c.decision?.verdict || 'park';
    kids.push(el('div', { class: `row ${v.kind === 'candidate' && v.idx === i ? 'active' : ''}`, onclick: () => select('candidate', i) }, [
      el('span', { class: `cpri ${c.priority}`, text: c.priority }),
      el('span', { class: 'tag', text: `#${c.tag}` }),
      el('span', { class: `badge ${ver}`, text: ver }),
    ]));
  });

  $('#sidebar').replaceChildren(...kids);
}

function navbar(idx, total, go) {
  const prev = el('button', { class: 'nav', text: '◀ Prev', onclick: () => go(idx - 1) });
  const next = el('button', { class: 'nav', text: 'Next ▶', onclick: () => go(idx + 1) });
  prev.disabled = idx <= 0;
  next.disabled = idx >= total - 1;
  return el('div', { class: 'navbar' }, [prev, el('span', { class: 'pos', text: `${idx + 1} / ${total}` }), next]);
}

function renderDetail() {
  const v = state.view;
  if (v.kind === 'scorecard') return renderScorecardDetail();
  if (v.kind === 'nits') return renderNitsDetail();
  if (v.kind === 'candidate') return renderCandidateDetail();
  if (v.kind === 'proposal') return renderProposalDetail();
  $('#detail').replaceChildren(el('div', { class: 'empty', text: 'No proposals or candidates. Run /instruction-review.' }));
  return undefined;
}

// Toggle the scorecard drill-down filter. Clicking a cell filters the findings
// list to its (dimension, lens); clicking the same cell clears it. Loose `==`
// for lens so a global row (lens null) matches a migrated global finding (undefined).
function toggleScFilter(dimension, lens) {
  const f = state.scFilter;
  if (f && f.dimension === dimension && f.lens == lens) state.scFilter = null;
  else state.scFilter = { dimension, lens: lens ?? null };
  renderScorecardDetail();
}

// --- scorecard focused view (main area) ---
function renderScorecardDetail() {
  const sc = state.data.scorecard;
  if (!sc) { $('#detail').replaceChildren(el('div', { class: 'empty', text: 'No scorecard.' })); return; }
  const kids = [el('h2', { text: 'Scorecard' })];
  // Legend: what the matrix icons mean + how a cell is derived. Built from ICON
  // so it never drifts from the verdicts the cells actually render.
  kids.push(el('div', { class: 'sclegend' }, [
    ...['strong', 'good', 'weak', 'gaps'].map((v) =>
      el('span', { class: 'sclegend-item', title: v }, [
        el('span', { text: `${ICON[v]} ` }), el('span', { text: v }),
      ])),
    el('span', { class: 'sclegend-note', text: 'cell = worst of its findings; click a non-strong cell to drill down' }),
  ]));
  // Trend vs the previous round (triage.prev.json archive, if any): ↑ improved
  // (verdict got better), ↓ worse. No arrow when there is no prior or no change.
  const prev = state.prevScorecard;
  const prevVerdict = (dim, lens) => {
    if (!prev) return null;
    if (lens == null) { const r = (prev.global || []).find((g) => g && g.dimension === dim); return r ? r.verdict : null; }
    const row = (prev.perLens || []).find((r) => r && r.dimension === dim);
    const cell = row && Array.isArray(row.cells) ? row.cells.find((c) => c && c.lens === lens) : null;
    return cell ? cell.verdict : null;
  };
  const trend = (dim, lens, cur) => {
    const p = prevVerdict(dim, lens);
    if (p == null || !(cur in SC_RANK) || !(p in SC_RANK) || p === cur) return null;
    const up = SC_RANK[cur] < SC_RANK[p]; // lower rank = better
    return el('span', { class: `sctrend ${up ? 'up' : 'down'}`, title: `${p} → ${cur} vs previous run`, text: up ? ' ↑' : ' ↓' });
  };
  if (sc.lenses?.length && sc.perLens?.length) {
    const cols = `grid-template-columns:1.4fr repeat(${sc.lenses.length},1fr)`;
    const head = el('div', { class: 'scrow head', style: cols }, [
      el('div', { class: 'sccell lbl', text: 'dimension' }),
      ...sc.lenses.map((l) => el('div', { class: 'sccell lbl', text: l })),
    ]);
    const rows = sc.perLens.map((row) => el('div', { class: 'scrow', style: cols }, [
      el('div', { class: 'sccell lbl', text: row.dimension }),
      ...row.cells.map((c) => {
        const clickable = c.verdict !== 'strong';
        const sel = state.scFilter && state.scFilter.dimension === row.dimension && state.scFilter.lens == c.lens;
        return el('div', {
          class: `sccell ${clickable ? 'clickable' : ''} ${sel ? 'selected' : ''}`,
          title: `${c.lens}: ${c.verdict}`,
          ...(clickable ? { onclick: () => toggleScFilter(row.dimension, c.lens) } : {}),
        }, [el('span', { text: ICON[c.verdict] || '?' }), trend(row.dimension, c.lens, c.verdict)].filter(Boolean));
      }),
    ]));
    kids.push(el('div', { class: 'scmatrix' }, [head, ...rows]));
  }
  if (sc.global?.length) {
    kids.push(el('label', { class: 'field', text: 'global' }));
    kids.push(el('div', { class: 'scglobal' }, sc.global.map((g) => {
      const clickable = g.verdict !== 'strong';
      const sel = state.scFilter && state.scFilter.dimension === g.dimension && state.scFilter.lens == null;
      return el('div', {
        class: `scg ${clickable ? 'clickable' : ''} ${sel ? 'selected' : ''}`,
        title: g.verdict,
        ...(clickable ? { onclick: () => toggleScFilter(g.dimension, null) } : {}),
      }, [el('span', { text: `${ICON[g.verdict] || '?'} ` }), el('span', { text: g.dimension }), trend(g.dimension, null, g.verdict)].filter(Boolean));
    })));
  }
  // strong findings carry no signal and are never shown; orphans (no declared
  // cell) only show unfiltered. Loose `==` on lens for the global/migrated case.
  let findings = (sc.details || []).filter((d) => d.verdict !== 'strong');
  if (state.scFilter) {
    findings = findings.filter((d) => d.dimension === state.scFilter.dimension && d.lens == state.scFilter.lens);
  }
  if (findings.length) {
    const lbl = state.scFilter
      ? `findings — ${state.scFilter.dimension}${state.scFilter.lens ? ' / ' + state.scFilter.lens : ' (global)'} (click the cell again to clear)`
      : 'findings';
    kids.push(el('label', { class: 'field', text: lbl }));
    kids.push(el('div', { class: 'scdetails' }, findings.map((d) =>
      el('div', { class: 'finding' }, [
        el('div', { class: 'finding-meta' }, [
          el('span', { class: `chip chip-verdict chip-${d.verdict}`, text: d.verdict }),
          el('span', { class: 'chip chip-dim', text: d.dimension }),
          d.lens ? el('span', { class: 'chip chip-role', text: d.lens }) : null,
          tagChip(d.tag),
          d.file ? el('code', { class: 'finding-file', text: d.file }) : null,
          tagLocation(d.tag) ? null : el('button', { class: 'chip chip-create', title: 'Create a candidate from this finding', text: '+ candidate', onclick: () => createCandidateFromFinding(d) }),
        ].filter(Boolean)),
        el('div', { class: 'finding-note' }, richText(d.note || '')),
      ]))));
  }
  $('#detail').replaceChildren(...kids);
}

// --- nits focused view (main area): mechanical nits as a working checklist ---
// Split out of the scorecard view so the sidebar's "Nits" item owns it.
function renderNitsDetail() {
  const sc = state.data.scorecard;
  if (!sc) { $('#detail').replaceChildren(el('div', { class: 'empty', text: 'No scorecard.' })); return; }
  const kids = [el('h2', { text: 'Mechanical nits' })];
  kids.push(el('div', { class: 'sclegend' }, [
    el('span', { class: 'sclegend-item' }, [el('span', { text: '🤖 ' }), el('span', { text: 'you fix = the /instruction-apply agent fixes it' })]),
    el('span', { class: 'sclegend-note', text: 'a nit is an ephemeral round artifact; "✓ I fix" removes it once handled' }),
  ]));
  if (!sc.nits?.length) {
    kids.push(el('div', { class: 'empty', text: 'No nits this round.' }));
    $('#detail').replaceChildren(...kids);
    return;
  }
  kids.push(el('div', { class: 'scnits' }, sc.nits.map((n, i) => {
    const auto = n.fix === 'auto';
    return el('div', { class: `scn ${auto ? 'auto' : ''}` }, [
      el('span', { class: 'scn-bullet', text: auto ? '🤖' : '•' }),
      el('span', { class: 'scn-text' }, richText(n.text || '')),
      el('button', { class: `nit-fix ${auto ? 'on' : ''}`, title: auto ? 'Flagged for the agent to fix on /instruction-apply (click to unflag)' : 'Flag for the agent to fix (you fix)', text: 'you fix', onclick: () => toggleNitFix(i) }),
      el('button', { class: 'nit-done', title: 'I fixed it — remove', text: '✓ I fix', onclick: () => dismissNit(i) }),
    ]);
  })));
  $('#detail').replaceChildren(...kids);
}

// --- candidate focused view (main area): tag + verdict selector + nav ---
let candidateRefs = null;
function renderCandidateDetail() {
  const cs = sortedCandidates();
  const c = cs[state.view.idx];
  if (!c) return;

  const noteLabel = el('label', { class: 'field', text: CAND_NOTE_LABEL[c.decision?.verdict || 'park'] });
  const noteBox = el('textarea', { class: 'details', placeholder: 'Free-text note — guidance for drafting a wanted rule, a reject reason, or a reminder', oninput: () => { applyCandidate(c); scheduleSave(); } });
  noteBox.value = c.decision?.details || '';

  const radios = el('div', { class: 'verdicts' }, ['park', 'wanted', 'reject'].map((vv) => {
    const input = el('input', { type: 'radio', name: 'cverdict', value: vv, onchange: () => { applyCandidate(c); scheduleSave(); } });
    if ((c.decision?.verdict || 'park') === vv) input.checked = true;
    return el('label', {}, [input, el('span', { text: vv })]);
  }));

  candidateRefs = { c, noteBox, noteLabel };

  const nav = navbar(state.view.idx, cs.length, (i) => select('candidate', i));

  $('#detail').replaceChildren(
    el('div', { class: 'meta', text: `candidate · ${c.kind} · ${c.role} · ${c.targetFile} · priority: ${c.priority}` }),
    el('h2', { text: `#${c.tag}` }),
    el('div', { class: 'gap', text: c.gap || '' }),
    el('label', { class: 'field', text: 'Verdict' }),
    radios,
    noteLabel,
    noteBox,
    nav,
  );
}

function selectedCandidateVerdict() {
  const checked = document.querySelector('input[name="cverdict"]:checked');
  return checked ? checked.value : 'park';
}
function applyCandidate(c) {
  const verdict = selectedCandidateVerdict();
  const d = { verdict };
  // Free-text note allowed on any candidate verdict (drafting guidance / reject
  // reason / park reminder); it rides along to /instruction-apply.
  const note = candidateRefs?.noteBox.value.trim();
  if (note) d.details = note;
  c.decision = d;
  if (candidateRefs) candidateRefs.noteLabel.textContent = CAND_NOTE_LABEL[verdict];
}

// --- proposal (entry) focused view ---
async function renderProposalDetail() {
  const idx = state.view.idx;
  const e = state.data.entries[idx];
  if (!e) return;

  // Fetch live text ONCE; reuse e._live for in-place diff re-renders. Guard a
  // fast-navigation race: if the view moved while the fetch was in flight,
  // abandon this stale render.
  const my = idx;
  const curText = await liveCurrent(e);
  if (state.view.kind !== 'proposal' || state.view.idx !== my) return;

  const diffNode = renderDiff(e, curText);
  let currentDiff = diffNode;

  const draft = el('textarea', { class: 'draft' });
  draft.value = e.draft || '';
  draft.addEventListener('input', () => {
    e.draft = draft.value;
    const fresh = renderDiff(e, e._live);
    currentDiff.replaceWith(fresh);
    currentDiff = fresh;
    scheduleSave();
  });
  const draftWrap = el('div', { class: 'editor hidden' }, [draft]);
  const editToggle = el('button', { class: 'nav small', text: '✎ Edit draft', onclick: () => {
    const hidden = draftWrap.classList.toggle('hidden');
    editToggle.textContent = hidden ? '✎ Edit draft' : '▾ Hide editor';
    if (!hidden) draft.focus();
  } });

  const detailsBox = el('textarea', { class: 'details', oninput: () => { applyDecision(e); scheduleSave(); } });
  detailsBox.value = e.decision?.details || '';

  const foldWrap = el('div');
  const foldSelect = el('select', { onchange: () => { applyDecision(e); scheduleSave(); } },
    [el('option', { value: '', text: '— fold target —' }), ...state.tags.map((t) => el('option', { value: t, text: t }))]);
  if (e.decision?.foldTarget) foldSelect.value = e.decision.foldTarget;

  const verdicts = el('div', { class: 'verdicts' }, VERDICTS.map((v) => {
    const input = el('input', { type: 'radio', name: 'verdict', value: v, onchange: () => { applyDecision(e); refreshConditional(e, detailsBox, detailsLabel, foldWrap, foldSelect); scheduleSave(); } });
    if ((e.decision?.verdict || 'park') === v) input.checked = true;
    return el('label', {}, [input, el('span', { text: v })]);
  }));

  detailRefs = { e, detailsBox, foldSelect, verdicts };
  const detailsLabel = el('label', { class: 'field', text: DETAIL_LABEL[e.decision?.verdict || 'park'] });
  detailRefs.detailsLabel = detailsLabel;

  const refineReply = (e.decision?.verdict === 'refine' && (e.decision?.details || e.lastRoundReply))
    ? el('div', { class: 'reply' }, [
        e.decision?.details ? el('div', { class: 'reply-q', text: e.decision.details }) : null,
        e.lastRoundReply ? el('div', { class: 'reply-a', text: e.lastRoundReply }) : null,
      ])
    : null;

  const nav = navbar(idx, state.data.entries.length, (i) => select('proposal', i));

  // filter(Boolean): refineReply is null for non-refine entries, and
  // replaceChildren() would coerce a null arg into a literal "null" text node.
  $('#detail').replaceChildren(...[
    el('div', { class: 'meta', text: `${e.kind} · ${e.role} · ${e.targetFile} · status: ${e.status?.state}` }),
    el('h2', { text: `#${e.tag}` }),
    el('div', { class: 'gap', text: e.gap || '' }),
    el('label', { class: 'field', text: 'current → draft' }),
    currentDiff,
    editToggle,
    draftWrap,
    verdicts,
    detailsLabel,
    detailsBox,
    foldWrap,
    refineReply,
    nav,
  ].filter(Boolean));
  refreshConditional(e, detailsBox, detailsLabel, foldWrap, foldSelect);
}

let detailRefs = null;

function selectedVerdict() {
  const checked = document.querySelector('input[name="verdict"]:checked');
  return checked ? checked.value : 'park';
}

function applyDecision(e) {
  const verdict = selectedVerdict();
  const details = detailRefs.detailsBox.value.trim();
  const d = { verdict };
  if (verdict === 'fold') { if (detailRefs.foldSelect.value) d.foldTarget = detailRefs.foldSelect.value; if (details) d.details = details; }
  else if (['reject', 'defer', 'refine'].includes(verdict)) { if (details) d.details = details; }
  // adopt/park: no details field
  e.decision = d;
  if (detailRefs.detailsLabel) detailRefs.detailsLabel.textContent = DETAIL_LABEL[verdict];
}

function refreshConditional(e, detailsBox, detailsLabel, foldWrap, foldSelect) {
  const verdict = selectedVerdict();
  foldWrap.replaceChildren();
  if (verdict === 'fold') {
    foldWrap.append(el('label', { class: 'field', text: 'Fold target (#tag)' }), foldSelect);
  }
  const hideDetails = NO_DETAILS_VERDICTS.has(verdict);
  detailsLabel.style.display = hideDetails ? 'none' : '';
  detailsBox.style.display = hideDetails ? 'none' : '';
}

// Task 1: fetch the live rule text from the server, cached on e._live
async function liveCurrent(e) {
  if (e._live !== undefined) return e._live;
  if (e.kind === 'new-rule') return (e._live = '');
  try {
    const r = await (await fetch(`/api/rule?targetFile=${encodeURIComponent(e.targetFile)}`)).json();
    return (e._live = r.exists ? r.text : '');
  } catch { return (e._live = ''); }
}

// curText is passed in so renderDiff doesn't re-fetch on every keystroke
function renderDiff(entry, curText) {
  const rows = lineDiff(curText || '', entry.draft || '');
  const cell = (text, cls) => el('div', { class: `cell ${cls}`, text: text ?? '' });
  const out = [el('div', { class: 'drow head' }, [cell('current', 'lbl'), cell('draft', 'lbl')])];
  let dels = [];
  let adds = [];
  const flush = () => {
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) {
      out.push(el('div', { class: 'drow' }, [
        cell(dels[k], dels[k] === undefined ? 'empty' : 'del'),
        cell(adds[k], adds[k] === undefined ? 'empty' : 'add'),
      ]));
    }
    dels = []; adds = [];
  };
  for (const r of rows) {
    if (r.type === 'same') { flush(); out.push(el('div', { class: 'drow' }, [cell(r.text, 'same'), cell(r.text, 'same')])); }
    else if (r.type === 'del') dels.push(r.text);
    else adds.push(r.text);
  }
  flush();
  return el('div', { class: 'diff sxs' }, out);
}

// Apply button handler
const applyBtn = $('#apply');
applyBtn.addEventListener('click', async () => {
  if (!window.confirm('Apply all terminal decisions (adopt/reject/fold/defer) now? This writes instruction files, runs the test suite per adopt, and commits the result.')) return;

  const t0 = Date.now();
  const tick = () => { applyBtn.textContent = `Applying… ${Math.round((Date.now() - t0) / 1000)}s`; };
  applyBtn.disabled = true;
  tick();
  const timer = setInterval(tick, 1000);
  setSave('applying… (see terminal for per-entry progress)');

  try {
    const res = await fetch('/api/apply', { method: 'POST' });
    if (res.status === 200) {
      const { report, commit } = await res.json();
      renderReport(report, null, commit);
      await load();
      setSave('applied', 'ok');
    } else if (res.status === 409) {
      const b = await res.json();
      const paths = (b.paths || []).join('\n  ');
      renderReport(null, `Apply refused: commit/stash these first:\n  ${paths}`);
      setSave('not applied', 'err');
    } else if (res.status === 423) {
      renderReport(null, 'Apply already running (locked). Try again shortly.');
      setSave('locked', 'err');
    } else {
      const b = await res.json().catch(() => ({}));
      renderReport(null, `Apply failed: ${b.error || res.statusText}`);
      setSave('not applied', 'err');
    }
  } catch (err) {
    renderReport(null, `Apply failed: ${err.message}`);
    setSave('not applied', 'err');
  } finally {
    clearInterval(timer);
    applyBtn.disabled = false;
    applyBtn.textContent = 'Apply decisions';
  }
});

function renderReport(report, errorMsg, commit) {
  const old = $('#report-panel');
  if (old) old.remove();

  const lines = [];
  if (errorMsg) {
    lines.push(el('div', { class: 'report-error', text: errorMsg }));
  } else if (report) {
    const keys = ['adopted', 'rejected', 'folded', 'deferred', 'refined', 'parked', 'skipped', 'wanted', 'ignored', 'failed'];
    for (const k of keys) {
      if (report[k] !== undefined) {
        lines.push(el('div', { class: 'report-row' }, [
          el('span', { class: 'report-key', text: k }),
          el('span', { class: 'report-val', text: String(report[k]) }),
        ]));
      }
    }
    if (commit?.sha) {
      lines.push(el('div', { class: 'report-row' }, [
        el('span', { class: 'report-key', text: 'committed' }),
        el('span', { class: 'report-val', text: `${commit.sha} (${commit.summary})` }),
      ]));
    } else if (commit?.error) {
      lines.push(el('div', { class: 'report-error', text: `commit failed: ${commit.error}` }));
    }
  }

  const panel = el('div', { class: 'report', id: 'report-panel' }, [
    el('div', { class: 'report-head' }, [
      el('span', { text: errorMsg ? 'Apply error' : 'Apply report' }),
      el('button', { class: 'nav small', text: '✕', onclick: () => panel.remove() }),
    ]),
    ...lines,
  ]);
  document.querySelector('header').after(panel);
}

// Arrow keys navigate within the current section when focus isn't in a field.
document.addEventListener('keydown', (ev) => {
  if (['TEXTAREA', 'SELECT', 'INPUT'].includes(document.activeElement?.tagName)) return;
  const v = state.view;
  if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
  const step = ev.key === 'ArrowLeft' ? -1 : 1;
  if (v.kind === 'proposal') {
    const n = state.data.entries.length;
    select('proposal', Math.max(0, Math.min(n - 1, v.idx + step)));
  } else if (v.kind === 'candidate') {
    const n = sortedCandidates().length;
    select('candidate', Math.max(0, Math.min(n - 1, v.idx + step)));
  }
});

load();
