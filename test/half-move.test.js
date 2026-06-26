import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const SHIPPED = join(root, 'tools/claude');

// Recursively list shipped text files.
function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(SHIPPED).filter((p) => /\.(md|json)$/.test(p));
const texts = files.map((p) => ({ p, t: readFileSync(p, 'utf8') }));

test('no shipped file references a devtools/claude path', () => {
  const hits = texts.filter(({ t }) => t.includes('devtools/claude/'));
  assert.deepEqual(hits.map((h) => h.p), [], 'shipped files must not point into the moved root');
});

test('no shipped file spawns a moved agent or invokes a moved command (invocation syntax only)', () => {
  // Invocation syntax: slash-command tokens and explicit agent spawn-target ids.
  // Excludes YAML description: prose and #-commented example lines (inert).
  const MOVED = ['/instruction-review', '/instruction-apply', 'review-ai', 'review-git', 'ai-engineer'];
  const offenders = [];
  for (const { p, t } of texts) {
    for (const line of t.split('\n')) {
      const s = line.trim();
      if (s.startsWith('#') || /^description:/.test(s)) continue; // inert prose / commented examples
      for (const id of MOVED) {
        if (s.includes(id) && /(subagent_type|spawn|dispatch|Task|Agent)/i.test(s)) offenders.push(`${p}: ${id}`);
        if (id.startsWith('/') && s.includes(id)) offenders.push(`${p}: ${id}`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'a shipped file actively invokes a moved tool — half-move');
});
