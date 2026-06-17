import { lineDiff } from './diff.mjs';

const VERDICTS = ['park', 'adopt', 'reject', 'fold', 'defer', 'refine'];
const DETAIL_LABEL = {
  reject: 'Reason (required)', defer: 'Condition to adopt (required)',
  refine: 'Input / question (required)', fold: 'Reason (required)',
  park: 'Note (optional)', adopt: 'Note (optional)',
};

const state = { data: { round: '', entries: [] }, version: null, tags: [], sel: 0 };
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
    state.data = t.data || { round: '', entries: [] };
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

async function save() {
  setSave('saving…');
  const res = await fetch('/api/triage', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: state.data, version: state.version }),
  });
  if (res.status === 200) { state.version = (await res.json()).version; setSave('saved', 'ok'); renderSidebar(); }
  else if (res.status === 409) { setSave('changed on disk — reloading', 'err'); await load(); }
  else { const b = await res.json(); setSave(`not saved: ${b.problems ? b.problems[0] : b.error}`, 'err'); }
}

function render() {
  const total = state.data.entries.length;
  $('#counter').textContent = total ? `${decidedCount()}/${total} decided` : '';
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

function renderDiff(entry) {
  const rows = lineDiff(entry.current || '', entry.draft || '');
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

function renderDetail() {
  const e = state.data.entries[state.sel];
  if (!e) return;
  const diffNode = renderDiff(e);

  let currentDiff = diffNode;
  const draft = el('textarea', { class: 'draft' });
  draft.value = e.draft || '';
  draft.addEventListener('input', () => {
    e.draft = draft.value;
    const fresh = renderDiff(e);          // re-render the diff in place, keep textarea focus
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
    const input = el('input', { type: 'radio', name: 'verdict', value: v, onchange: () => { applyDecision(e); refreshConditional(e, detailsBox, foldWrap, foldSelect); scheduleSave(); } });
    if ((e.decision?.verdict || 'park') === v) input.checked = true;
    return el('label', {}, [input, el('span', { text: v })]);
  }));

  // expose nodes for applyDecision/refreshConditional
  detailRefs = { e, detailsBox, foldSelect, verdicts };

  const detailsLabel = el('label', { class: 'field', text: DETAIL_LABEL[e.decision?.verdict || 'park'] });
  detailRefs.detailsLabel = detailsLabel;

  const total = state.data.entries.length;
  const prev = el('button', { class: 'nav', text: '◀ Prev', onclick: () => goTo(state.sel - 1) });
  const next = el('button', { class: 'nav', text: 'Next ▶', onclick: () => goTo(state.sel + 1) });
  prev.disabled = state.sel === 0;
  next.disabled = state.sel === total - 1;
  const nav = el('div', { class: 'navbar' }, [prev, el('span', { class: 'pos', text: `${state.sel + 1} / ${total}` }), next]);

  $('#detail').replaceChildren(
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
    nav,
  );
  refreshConditional(e, detailsBox, foldWrap, foldSelect);
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
  else if (details) d.details = details; // park/adopt optional note
  e.decision = d;
  if (detailRefs.detailsLabel) detailRefs.detailsLabel.textContent = DETAIL_LABEL[verdict];
}

function refreshConditional(e, detailsBox, foldWrap, foldSelect) {
  const verdict = selectedVerdict();
  foldWrap.replaceChildren();
  if (verdict === 'fold') {
    foldWrap.append(el('label', { class: 'field', text: 'Fold target (#tag)' }), foldSelect);
  }
}

function goTo(i) {
  const n = state.data.entries.length;
  if (!n) return;
  state.sel = Math.max(0, Math.min(n - 1, i));
  renderSidebar();
  renderDetail();
}

// Arrow keys navigate when focus isn't in an editable field.
document.addEventListener('keydown', (ev) => {
  if (['TEXTAREA', 'SELECT', 'INPUT'].includes(document.activeElement?.tagName)) return;
  if (ev.key === 'ArrowLeft') goTo(state.sel - 1);
  else if (ev.key === 'ArrowRight') goTo(state.sel + 1);
});

load();
