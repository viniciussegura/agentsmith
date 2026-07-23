import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInstallPlan, buildUninstallPlan, renderPlan } from '../src/plan.js';

const built = {
  corePath: '.agentsmith/AGENTS.md', coreContent: 'CORE',
  bundles: [{ path: '.agentsmith/agents/frontend.md', content: 'FE' }],
  stub: { path: 'AGENTS.md', content: 'STUB' },
};
const adapterPlan = [{ src: 'tools/claude/skills/x/SKILL.md', dest: '.claude/skills/x/SKILL.md' }];

test('install plan writes core+bundles+adapters and merges settings when tools on', () => {
  const p = buildInstallPlan({ base: '/b', absolute: false, built, adapterPlan, scope: { kind: 'project' },
    flags: { mode: 'split', placement: 'nested', tools: true, dev: false, clean: false, yes: false, dryRun: false },
    prevManifestPaths: [], stubExists: false });
  const kinds = p.ops.map((o) => o.kind);
  assert.ok(kinds.includes('write'));
  assert.ok(kinds.includes('mergeSettings'));
  assert.ok(!kinds.includes('unmergeSettings'));
  assert.ok(p.manifestPaths.includes('.agentsmith/AGENTS.md'));
  assert.ok(p.manifestPaths.includes('.claude/skills/x/SKILL.md'));
});

test('install --no-tools un-merges the hook instead of merging (bug-2 fix)', () => {
  const p = buildInstallPlan({ base: '/b', absolute: false, built, adapterPlan: [], scope: { kind: 'project' },
    flags: { mode: 'split', placement: 'nested', tools: false, dev: false, clean: false, yes: false, dryRun: false },
    prevManifestPaths: [], stubExists: false });
  const kinds = p.ops.map((o) => o.kind);
  assert.ok(kinds.includes('unmergeSettings'), 'tools-off un-merges');
  assert.ok(!kinds.includes('mergeSettings'), 'tools-off never merges');
});

test('install keeps an existing stub rather than overwriting', () => {
  const p = buildInstallPlan({ base: '/b', absolute: false, built, adapterPlan, scope: { kind: 'project' },
    flags: { mode: 'split', placement: 'nested', tools: true, dev: false, clean: false, yes: false, dryRun: false },
    prevManifestPaths: [], stubExists: true });
  assert.ok(p.ops.some((o) => o.kind === 'keepStub'));
  assert.ok(!p.ops.some((o) => o.kind === 'write' && o.path === 'AGENTS.md'));
});

test('install prunes recorded orphans no longer produced', () => {
  const p = buildInstallPlan({ base: '/b', absolute: false, built, adapterPlan, scope: { kind: 'project' },
    flags: { mode: 'split', placement: 'nested', tools: true, dev: false, clean: false, yes: false, dryRun: false },
    prevManifestPaths: ['.claude/commands/ghost.md'], stubExists: false });
  const prune = p.ops.find((o) => o.kind === 'prune');
  assert.ok(prune.paths.includes('.claude/commands/ghost.md'));
});

test('uninstall plan prunes all manifest paths, un-merges, removes import (user)', () => {
  const p = buildUninstallPlan({ base: '/home', absolute: true, manifestPaths: ['.agentsmith/AGENTS.md', '.claude/skills/x/SKILL.md'],
    stubContent: 'STUB', stubOnDiskContent: 'STUB', hasSettings: true, hasClaudeMd: true, isUser: true });
  const kinds = p.ops.map((o) => o.kind);
  assert.ok(kinds.includes('prune'));
  assert.ok(kinds.includes('unmergeSettings'));
  assert.ok(kinds.includes('removeImport'));
  assert.ok(p.ops.some((o) => o.kind === 'prune' && o.paths.includes('.claude/skills/x/SKILL.md')));
  assert.equal(p.manifestPaths.length, 0);
});

test('uninstall keeps an edited stub', () => {
  const p = buildUninstallPlan({ base: '/home', absolute: true, manifestPaths: [],
    stubContent: 'STUB', stubOnDiskContent: 'EDITED BY USER', hasSettings: false, hasClaudeMd: false, isUser: false });
  assert.ok(p.ops.some((o) => o.kind === 'keepStub'));
});

test('renderPlan marks deletes distinctly from writes', () => {
  const out = renderPlan({ base: '/b', absolute: false, manifestPaths: [], ops: [
    { kind: 'write', path: '.agentsmith/AGENTS.md' },
    { kind: 'prune', paths: ['.claude/a.md', '.claude/b.md'] },
    { kind: 'unmergeSettings', path: '.claude/settings.json' },
  ] });
  assert.match(out, /delete/i);
  assert.match(out, /write/i);
  assert.doesNotMatch(out, /unmergeSettings/);       // internal enum never printed verbatim
});
