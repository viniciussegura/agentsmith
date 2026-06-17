/**
 * Dev-only local triage UI server. Node built-in `http`, zero dependencies.
 * Serves the vanilla front-end and a small JSON API over `triage.json`.
 *
 *   GET  /                 -> index.html
 *   GET  /app.js etc.      -> static assets (hardcoded MIME map)
 *   GET  /api/triage       -> { data, version, empty }
 *   GET  /api/tags         -> string[] of live #tags (fold-target dropdown)
 *   PUT  /api/triage       -> body { data, version }; 409 on stale version,
 *                             400 on schema errors, else atomic write + { version }
 *
 * `createServer(opts)` is injectable for tests; `start()` is the CLI entry.
 */

import http from 'node:http';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateFile, validateCrossRefs, canonicalJSON, versionToken } from './schema.mjs';

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

function readTriage(path) {
  if (!existsSync(path)) return { data: EMPTY, version: null, empty: true };
  const text = readFileSync(path, 'utf8');
  try {
    return { data: JSON.parse(text), version: versionToken(text), empty: false };
  } catch {
    return { data: EMPTY, version: null, empty: true, unparseable: true };
  }
}

// Sentinel for an existing-but-unparseable file: no client `version` (null or a
// 64-hex hash) can ever equal it, so a PUT is always rejected -> never overwritten.
const UNPARSEABLE = '__unparseable__';

function currentToken(path) {
  if (!existsSync(path)) return null;
  try { return versionToken(readFileSync(path, 'utf8')); } catch { return UNPARSEABLE; }
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

function liveTagsFromCli() {
  try {
    const out = execSync('node bin/cli.js --stdout', { cwd: REPO_ROOT, encoding: 'utf8' });
    const tags = new Set();
    for (const m of out.matchAll(/^##\s+(#\S+)/gm)) tags.add(m[1]);
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
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    // --- API ---
    if (path === '/api/triage' && req.method === 'GET') {
      return send(res, 200, readTriage(triagePath));
    }
    if (path === '/api/tags' && req.method === 'GET') {
      return send(res, 200, { tags: tagsProvider() });
    }
    if (path === '/api/triage' && req.method === 'PUT') {
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
