/**
 * Dev-only local triage UI server. Node built-in `http`, zero dependencies.
 * Serves the vanilla front-end and a small JSON API over `triage.json`.
 *
 *   GET  /                 -> index.html
 *   GET  /app.js etc.      -> static assets (hardcoded MIME map)
 *   GET  /api/triage       -> { data, version, empty }
 *   GET  /api/tags         -> string[] of live #tags (fold-target dropdown)
 *   GET  /api/rule         -> { exists, text? } for a given instructions file
 *   PUT  /api/triage       -> body { data, version }; 409 on stale version,
 *                             400 on schema errors, else atomic write + { version }
 *   POST /api/apply        -> run apply() in-process; 423 if already applying,
 *                             409 if instructions/ is dirty, else { report, version }
 *
 * `createServer(opts)` is injectable for tests; `start()` is the CLI entry.
 */

import http from 'node:http';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { execSync, execFileSync } from 'node:child_process';
import { dirname, join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateFile, validateCrossRefs, canonicalJSON, versionToken, migrateWorksheet } from './schema.mjs';
import { apply } from './apply.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const DEFAULT_TRIAGE = join(REPO_ROOT, '.agentsmith', 'instruction-review', 'triage.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
const STATIC = new Set(['/', '/index.html', '/app.js', '/style.css', '/diff.mjs', '/schema.mjs']);

const EMPTY = { round: '', entries: [] };

// Sentinel for an existing-but-unparseable file: no client `version` (null or a
// 64-hex hash) can ever equal it, so a PUT is always rejected -> never overwritten.
const UNPARSEABLE = '__unparseable__';

/**
 * Load the triage file and apply the v2 migration. Returns { data, missing }.
 * Does NOT write back to disk; the file on disk is changed only by PUT/apply.
 */
function loadMigrated(path) {
  if (!existsSync(path)) return { data: { round: '', entries: [] }, missing: true };
  let parsed;
  try { parsed = JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
  return { data: migrateWorksheet(parsed), missing: false };
}

function readTriage(path) {
  const loaded = loadMigrated(path);
  if (loaded === null) return { data: EMPTY, version: null, empty: true, unparseable: true };
  if (loaded.missing) return { data: EMPTY, version: null, empty: true };
  const text = canonicalJSON(loaded.data);
  return { data: loaded.data, version: versionToken(text), empty: false };
}

function currentToken(path) {
  const loaded = loadMigrated(path);
  if (loaded === null) return UNPARSEABLE;
  if (loaded.missing) return null;
  return versionToken(canonicalJSON(loaded.data));
}

function atomicWrite(path, text) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, path);
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  const payload = type.startsWith('application/json') ? JSON.stringify(body) : body;
  res.writeHead(code, { 'Content-Type': type });
  res.end(payload);
}

/** True when the apply report changed a committed file (decisions log or instructions). */
export function hasCommittableChanges(report) {
  return ['adopted', 'rejected', 'folded', 'deferred', 'ignored'].some((k) => (report[k]?.length || 0) > 0);
}

/**
 * Auto-commit the files an apply touched, so the working tree returns to clean
 * and the next apply's clean-base preflight passes. Returns { sha, summary } on
 * a commit, null when nothing committable changed, { error } on a git failure
 * (the apply itself already succeeded — a commit failure is non-fatal).
 */
function commitApply(root, report) {
  const committable = ['adopted', 'rejected', 'folded', 'deferred', 'ignored'];
  if (!hasCommittableChanges(report)) return null;
  const summary = committable.filter((k) => report[k]?.length).map((k) => `${k} ${report[k].length}`).join(', ');
  const tags = committable.flatMap((k) => report[k] || []);
  const msg = [
    `🤖 chore(instructions): Apply triage (${summary})`,
    '',
    'Applied via the triage UI Apply button; adopts gated on node --test.',
    ...tags.map((t) => `- #${t}`),
    '',
    'Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>',
  ].join('\n');
  try {
    execFileSync('git', ['add', 'instructions', 'docs/instruction-rules-decisions.md'], { cwd: root });
    execFileSync('git', ['commit', '-m', msg], { cwd: root, stdio: 'pipe' });
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    return { sha, summary };
  } catch (err) {
    return { error: (err.stderr ? err.stderr.toString() : '') || String(err.message || err) };
  }
}

function liveTagsFromCli() {
  try {
    const out = execSync('node bin/cli.js --stdout', { cwd: REPO_ROOT, encoding: 'utf8' });
    const tags = new Set();
    for (const m of out.matchAll(/^#{1,6}\s+(#\S+)/gm)) tags.add(m[1]);
    return [...tags];
  } catch {
    return [];
  }
}

export function createServer({
  triagePath = DEFAULT_TRIAGE,
  staticDir = HERE,
  tagsProvider = liveTagsFromCli,
} = {}) {
  let applying = false;

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    // --- API ---
    if (path === '/api/triage' && req.method === 'GET') {
      return send(res, 200, readTriage(triagePath));
    }
    if (path === '/api/tags' && req.method === 'GET') {
      return send(res, 200, { tags: tagsProvider() });
    }
    if (path === '/api/rule' && req.method === 'GET') {
      const tf = url.searchParams.get('targetFile') || '';
      const abs = resolve(REPO_ROOT, tf);
      const instr = resolve(REPO_ROOT, 'instructions') + sep;
      if (!abs.startsWith(instr)) return send(res, 400, { error: 'path outside instructions/' });
      return send(res, 200, existsSync(abs)
        ? { exists: true, text: readFileSync(abs, 'utf8') }
        : { exists: false });
    }
    if (path === '/api/triage' && req.method === 'PUT') {
      if (applying) return send(res, 423, { error: 'applying' });
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        let body;
        try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'invalid JSON body' }); }
        const token = currentToken(triagePath);
        if (body.version !== token) {
          return send(res, 409, { error: 'stale version', version: token });
        }
        const problems = [...validateFile(body.data), ...validateCrossRefs(body.data, {
          liveTags: tagsProvider(),
        })];
        if (problems.length) return send(res, 400, { error: 'schema', problems });
        const text = canonicalJSON(body.data);
        atomicWrite(triagePath, text);
        return send(res, 200, { version: versionToken(text) });
      });
      return undefined;
    }
    if (path === '/api/apply' && req.method === 'POST') {
      if (applying) return send(res, 423, { error: 'applying' });
      // Clean-base preflight over every path the apply (and its auto-commit) may
      // touch, so the follow-up commit can never sweep in unrelated edits.
      const dirty = execFileSync('git', ['status', '--porcelain', 'instructions', 'docs/instruction-rules-decisions.md'],
        { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
      if (dirty) return send(res, 409, { error: 'dirty base', paths: dirty.split('\n') });
      applying = true;
      try {
        // Per-entry progress goes to the terminal running `npm run triage`.
        const onProgress = (ev) => {
          if (ev.type === 'start') console.log(`[apply] ${ev.total} entr${ev.total === 1 ? 'y' : 'ies'}…`);
          else if (ev.type === 'candidate') console.log(`[apply] candidate #${ev.tag} -> ${ev.outcome}`);
          else if (ev.phase === 'begin') console.log(`[apply] [${ev.i + 1}/${ev.total}] #${ev.tag} (${ev.verdict})`);
          else if (ev.phase === 'gate') console.log('[apply]         running node --test…');
          else if (ev.phase === 'done') console.log(`[apply]         -> ${ev.outcome}`);
        };
        // Pass live #tags so a `fold` entry's foldTarget passes cross-ref validation.
        const report = await apply({ root: REPO_ROOT, triagePath, liveTags: tagsProvider(), onProgress });
        const commit = report.error ? null : commitApply(REPO_ROOT, report);
        if (commit?.sha) console.log(`[apply] committed ${commit.sha} (${commit.summary})`);
        return send(res, 200, { report, version: currentToken(triagePath), commit });
      } catch (err) {
        return send(res, 500, { error: String(err.message || err) });
      } finally { applying = false; }
    }

    // --- static ---
    if (req.method === 'GET' && STATIC.has(path)) {
      const rel = path === '/' ? 'index.html' : path.slice(1);
      const file = join(staticDir, rel);
      if (!existsSync(file)) return send(res, 404, 'not found', 'text/plain');
      return send(res, 200, readFileSync(file), MIME[extname(file)] || 'application/octet-stream');
    }

    return send(res, 404, { error: 'not found' });
  });
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `cmd /c start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  try { execSync(cmd, { stdio: 'ignore' }); } catch { /* best-effort */ }
}

export function start(port = 4173) {
  const server = createServer();
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}`;
    console.log(`triage UI: ${url}`);
    openBrowser(url);
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start(Number(process.env.PORT) || 4173);
}
