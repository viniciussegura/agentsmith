import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../devtools/triage-ui/server.mjs';
import { canonicalJSON, versionToken } from '../devtools/triage-ui/schema.mjs';

const validFile = () => ({
  round: '2026-06-17',
  entries: [{
    tag: 'swe-errors', kind: 'strengthen', role: 'swe', targetFile: 'instructions/core/swe.md',
    status: { state: 'ready' }, gap: 'g', current: 'old', draft: 'new',
    decision: { verdict: 'park' }, applyLog: [],
  }],
});

function withServer(opts, fn) {
  return new Promise((resolve, reject) => {
    const server = createServer({ tagsProvider: () => ['#swe-done'], ...opts });
    server.listen(0, '127.0.0.1', async () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      try { await fn(base); resolve(); }
      catch (e) { reject(e); }
      finally { server.close(); }
    });
  });
}

function tmpTriage() {
  const dir = mkdtempSync(join(tmpdir(), 'triage-'));
  return join(dir, 'triage.json');
}

test('GET /api/triage on absent file -> empty + null version', async () => {
  const triagePath = tmpTriage();
  await withServer({ triagePath }, async (base) => {
    const r = await fetch(`${base}/api/triage`);
    const body = await r.json();
    assert.equal(body.empty, true);
    assert.equal(body.version, null);
  });
});

test('PUT creates the file (version null) then GET round-trips', async () => {
  const triagePath = tmpTriage();
  await withServer({ triagePath }, async (base) => {
    const data = validFile();
    const put = await fetch(`${base}/api/triage`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, version: null }),
    });
    assert.equal(put.status, 200);
    const { version } = await put.json();
    assert.equal(version, versionToken(canonicalJSON(data)));
    assert.ok(existsSync(triagePath));
    assert.ok(!existsSync(`${triagePath}.tmp`)); // atomic: temp cleaned up

    const got = await (await fetch(`${base}/api/triage`)).json();
    assert.deepEqual(got.data, data);
    assert.equal(got.version, version);
  });
});

test('PUT with a stale version -> 409, file unchanged', async () => {
  const triagePath = tmpTriage();
  const data = validFile();
  writeFileSync(triagePath, canonicalJSON(data), 'utf8');
  const before = readFileSync(triagePath, 'utf8');
  await withServer({ triagePath }, async (base) => {
    const r = await fetch(`${base}/api/triage`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, version: 'deadbeef' }),
    });
    assert.equal(r.status, 409);
    assert.equal(readFileSync(triagePath, 'utf8'), before);
  });
});

test('PUT schema-invalid -> 400 with problems', async () => {
  const triagePath = tmpTriage();
  await withServer({ triagePath }, async (base) => {
    const bad = validFile();
    delete bad.entries[0].draft; // strengthen requires draft
    const r = await fetch(`${base}/api/triage`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: bad, version: null }),
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.ok(body.problems.some((p) => p.includes('strengthen requires "draft"')));
  });
});

test('unparseable file is never overwritten (PUT -> 409)', async () => {
  const triagePath = tmpTriage();
  writeFileSync(triagePath, '{ not json', 'utf8');
  await withServer({ triagePath }, async (base) => {
    const got = await (await fetch(`${base}/api/triage`)).json();
    assert.equal(got.empty, true);
    const r = await fetch(`${base}/api/triage`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: validFile(), version: null }),
    });
    assert.equal(r.status, 409);
    assert.equal(readFileSync(triagePath, 'utf8'), '{ not json');
  });
});

test('GET /api/tags returns injected tags', async () => {
  await withServer({ triagePath: tmpTriage() }, async (base) => {
    const body = await (await fetch(`${base}/api/tags`)).json();
    assert.deepEqual(body.tags, ['#swe-done']);
  });
});
