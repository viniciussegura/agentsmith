import { lineDiff } from './diff.mjs';

const VERDICTS = ['park', 'adopt', 'reject', 'fold', 'defer', 'refine'];
const DETAIL_LABEL = {
  reject: 'Reason (required)', defer: 'Condition to adopt (required)',
  refine: 'Input / question (required)', fold: 'Reason (required)',
  park: 'Note (optional)', adopt: 'Note (optional)',
};
const NO_DETAILS_VERDICTS = new Set(['adopt', 'park']);

const state = { data: { round: '', entries: [], candidates: [], scorecard: null }, version: null, tags: [], sel: 0 };
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

async function load() {
  try {
    const t = await (await fetch('/api/triage')).json();
    state.data = t.data || { round: '', entries: [], candidates: [], scorecard: null };
    state.data.candidates = state.data.candidates ?? [];
    state.data.scorecard = state.data.scorecard ?? null;
    state.version = t.version;
    state.tags = (await (await fetch('/api/tags')).json()).tags || [];
    if (state.sel >= state.data.entries.length) state.sel = 0;
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

const ICON = { strong: '🟢', good: '🔵', weak: '🟡', gaps: '🔴' };

function renderScorecard() {
  const host = $('#scorecard');
  const sc = state.data.scorecard;
  if (!sc) { host.replaceChildren(); return; }
  const kids = [];
  if (sc.lenses && sc.lenses.length && sc.perLens && sc.perLens.length) {
    const head = el('div', { class: 'scrow head', style: `grid-template-columns:1.4fr repeat(${sc.lenses.length},1fr)` }, [
      el('div', { class: 'sccell lbl', text: 'dimension' }),
      ...sc.lenses.map((l) => el('div', { class: 'sccell lbl', text: l })),
    ]);
    const rows = sc.perLens.map((row) => el('div', { class: 'scrow', style: `grid-template-columns:1.4fr repeat(${sc.lenses.length},1fr)` }, [
      el('div', { class: 'sccell lbl', text: row.dimension }),
      ...row.cells.map((c) => el('div', { class: 'sccell', title: c.verdict, text: ICON[c.verdict] || '?' })),
    ]));
    kids.push(el('div', { class: 'scmatrix' }, [head, ...rows]));
  }
  if (sc.global && sc.global.length) {
    kids.push(el('div', { class: 'scglobal' }, sc.global.map((g) =>
      el('div', { class: 'scg' }, [el('span', { text: `${ICON[g.verdict] || '?'} ` }), el('span', { text: g.dimension })]))));
  }
  if (sc.details && sc.details.length) {
    kids.push(el('div', { class: 'scdetails' }, sc.details.map((d) =>
      el('div', { class: 'scd', text: `${d.dimension}${d.lens ? ' · ' + d.lens : ''} · ${d.file} · #${d.tag} · ${d.note}` }))));
  }
  if (sc.nits && sc.nits.length) {
    kids.push(el('div', { class: 'scnits' }, sc.nits.map((n) => el('div', { class: 'scn', text: `• ${n}` }))));
  }
  host.replaceChildren(el('details', { class: 'sccard', open: 'true' }, [
    el('summary', { text: 'Scorecard' }), ...kids,
  ]));
}

const PRI_RANK = { high: 0, medium: 1, low: 2 };
function renderCandidates() {
  const host = $('#candidates');
  const cs = [...(state.data.candidates || [])].sort((a, b) =>
    (PRI_RANK[a.priority] - PRI_RANK[b.priority]) || a.tag.toLowerCase().localeCompare(b.tag.toLowerCase()));
  if (!cs.length) { host.replaceChildren(); return; }
  const rows = cs.map((c) => {
    const sel = el('select', { class: 'cverdict', onchange: (e) => {
      c.decision = { verdict: e.target.value }; // park/wanted/reject; details left for the worksheet
      scheduleSave();
    } }, ['park', 'wanted', 'reject'].map((v) =>
      el('option', { value: v, ...(c.decision?.verdict === v ? { selected: 'true' } : {}), text: v })));
    return el('div', { class: 'crow' }, [
      el('span', { class: `cpri ${c.priority}`, text: c.priority }),
      el('span', { class: 'ctag', text: `#${c.tag}`, title: c.gap }),
      sel,
    ]);
  });
  host.replaceChildren(el('div', { class: 'chead', text: `Candidates (${cs.length})` }), ...rows);
}

function render() {
  const total = state.data.entries.length;
  $('#counter').textContent = total ? `${decidedCount()}/${total} decided` : '';
  renderScorecard();
  renderCandidates();
  if (!total) { $('#sidebar').replaceChildren(); $('#detail').replaceChildren(el('div', { class: 'empty', text: 'No entries. Run /instruction-review.' })); return; }
  renderSidebar();
  renderDetail();
}

const decidedCount = () => state.data.entries.filter((e) => e.decision?.verdict && e.decision.verdict !== 'park').length;

function renderSidebar() {
  $('#counter').textContent = `${decidedCount()}/${state.data.entries.length} decided`;
  const rows = state.data.entries.map((e, i) => {
    const v = e.decision?.verdict || 'park';
    return el('div', { class: `row ${i === state.sel ? 'active' : ''}`, onclick: () => { state.sel = i; renderSidebar(); renderDetail(); } }, [
      el('span', { class: 'tag', text: `#${e.tag}` }),
      el('span', { class: 'kind', text: e.kind }),
      el('span', { class: `badge ${v}`, text: v }),
    ]);
  });
  $('#sidebar').replaceChildren(...rows);
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

// Task 1: curText is passed in so renderDiff doesn't re-fetch on every keystroke
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

// Task 1: renderDetail is now async; fetches live current once, caches on e._live
async function renderDetail() {
  const e = state.data.entries[state.sel];
  if (!e) return;

  // Fetch live text ONCE; reuse e._live for in-place diff re-renders.
  // Guard against a fast-navigation race: if the selection changed while the
  // fetch was in flight, abandon this (stale) render so it can't overwrite the
  // newer one.
  const mySel = state.sel;
  const curText = await liveCurrent(e);
  if (state.sel !== mySel) return;

  const diffNode = renderDiff(e, curText);

  let currentDiff = diffNode;
  const draft = el('textarea', { class: 'draft' });
  draft.value = e.draft || '';
  draft.addEventListener('input', () => {
    e.draft = draft.value;
    // Reuse cached e._live — do NOT re-fetch
    const fresh = renderDiff(e, e._live);
    currentDiff.replaceWith(fresh);
    currentDiff = fresh;
    scheduleSave();
  });
  // The full-text editor is collapsed by default; the side-by-side diff is the primary view.
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

  // expose nodes for applyDecision/refreshConditional
  detailRefs = { e, detailsBox, foldSelect, verdicts };

  const detailsLabel = el('label', { class: 'field', text: DETAIL_LABEL[e.decision?.verdict || 'park'] });
  detailRefs.detailsLabel = detailsLabel;

  // Task 2: refine reply panel — shows the human question and agent answer (read-only)
  const refineReply = (e.decision?.verdict === 'refine' && (e.decision?.details || e.lastRoundReply))
    ? el('div', { class: 'reply' }, [
        e.decision?.details ? el('div', { class: 'reply-q', text: e.decision.details }) : null,
        e.lastRoundReply ? el('div', { class: 'reply-a', text: e.lastRoundReply }) : null,
      ])
    : null;

  const total = state.data.entries.length;
  const prev = el('button', { class: 'nav', text: '◀ Prev', onclick: () => goTo(state.sel - 1) });
  const next = el('button', { class: 'nav', text: 'Next ▶', onclick: () => goTo(state.sel + 1) });
  prev.disabled = state.sel === 0;
  next.disabled = state.sel === total - 1;
  const nav = el('div', { class: 'navbar' }, [prev, el('span', { class: 'pos', text: `${state.sel + 1} / ${total}` }), next]);

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
  // Task 2: adopt/park produce { verdict } with no details
  if (verdict === 'fold') { if (detailRefs.foldSelect.value) d.foldTarget = detailRefs.foldSelect.value; if (details) d.details = details; }
  else if (['reject', 'defer', 'refine'].includes(verdict)) { if (details) d.details = details; }
  // adopt/park: no details field
  e.decision = d;
  if (detailRefs.detailsLabel) detailRefs.detailsLabel.textContent = DETAIL_LABEL[verdict];
}

// Task 2: hide detailsBox + detailsLabel for adopt/park
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

// Task 3: Apply button handler
const applyBtn = $('#apply');
applyBtn.addEventListener('click', async () => {
  if (!window.confirm('Apply all terminal decisions (adopt/reject/fold/defer) now? This writes instruction files, runs the test suite per adopt, and commits the result.')) return;

  // Disable + live elapsed timer so the slow run (node --test per adopt) reads
  // as in-progress, not stuck. Per-entry progress prints to the triage terminal.
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
  // Remove any existing report panel
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

// Task 1: goTo now awaits the async renderDetail
async function goTo(i) {
  const n = state.data.entries.length;
  if (!n) return;
  state.sel = Math.max(0, Math.min(n - 1, i));
  renderSidebar();
  await renderDetail();
}

// Arrow keys navigate when focus isn't in an editable field.
document.addEventListener('keydown', async (ev) => {
  if (['TEXTAREA', 'SELECT', 'INPUT'].includes(document.activeElement?.tagName)) return;
  if (ev.key === 'ArrowLeft') await goTo(state.sel - 1);
  else if (ev.key === 'ArrowRight') await goTo(state.sel + 1);
});

load();
