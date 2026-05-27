import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = resolve(fileURLToPath(import.meta.url), '../../bin/cli.js');

function run(cwd, args = []) {
  execFileSync('node', [cli, ...args], { cwd });
}

test('default run emits lean core, bundle, and a root stub', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    run(dir);
    assert.ok(existsSync(join(dir, '.agentsmith/AGENTS.md')), 'nested core written');
    assert.ok(existsSync(join(dir, '.agentsmith/agents/frontend.md')), 'bundle written');
    assert.ok(existsSync(join(dir, 'AGENTS.md')), 'root stub written');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('folder sections inline the core and emit a file per bundle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    run(dir);
    const core = readFileSync(join(dir, '.agentsmith/AGENTS.md'), 'utf8');
    assert.match(core, /#swe-reuse/, 'a core-section rule is inlined');
    assert.doesNotMatch(core, /#be-api-first/, 'a bundle-section rule is not inlined in the lean core');
    assert.ok(existsSync(join(dir, '.agentsmith/agents/frontend.md')), 'frontend bundle written');
    assert.ok(existsSync(join(dir, '.agentsmith/agents/backend.md')), 'backend bundle written');
    const backend = readFileSync(join(dir, '.agentsmith/agents/backend.md'), 'utf8');
    assert.match(backend, /#be-api-first/, 'a bundle-section rule lands in its bundle file');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an existing root AGENTS.md is never clobbered', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-'));
  try {
    const root = join(dir, 'AGENTS.md');
    writeFileSync(root, 'MY OWN POINTER\n');
    run(dir);
    assert.equal(readFileSync(root, 'utf8'), 'MY OWN POINTER\n', 'consumer file preserved');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
