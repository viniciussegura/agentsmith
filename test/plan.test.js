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

test('install --no-tools un-merges the hook when an owned entry is present (bug-2 fix)', () => {
  const p = buildInstallPlan({ base: '/b', absolute: false, built, adapterPlan: [], scope: { kind: 'project' },
    flags: { mode: 'split', placement: 'nested', tools: false, dev: false, clean: false, yes: false, dryRun: false },
    prevManifestPaths: [], stubExists: false, settingsHasOwned: true });
  const kinds = p.ops.map((o) => o.kind);
  assert.ok(kinds.includes('unmergeSettings'), 'tools-off un-merges when ours is present');
  assert.ok(!kinds.includes('mergeSettings'), 'tools-off never merges');
});

test('install --no-tools emits no settings op when nothing agentsmith-owned is present', () => {
  const p = buildInstallPlan({ base: '/b', absolute: false, built, adapterPlan: [], scope: { kind: 'project' },
    flags: { mode: 'split', placement: 'nested', tools: false, dev: false, clean: false, yes: false, dryRun: false },
    prevManifestPaths: [], stubExists: false, settingsHasOwned: false });
  const kinds = p.ops.map((o) => o.kind);
  assert.ok(!kinds.includes('unmergeSettings'), 'no phantom un-merge on a settings.json without our hook');
  assert.ok(!kinds.includes('mergeSettings'));
});

test('install keeps an existing stub rather than overwriting', () => {
  const p = buildInstallPlan({ base: '/b', absolute: false, built, adapterPlan, scope: { kind: 'project' },
    flags: { mode: 'split', placement: 'nested', tools: true, dev: false, clean: false, yes: false, dryRun: false },
    prevManifestPaths: [], stubExists: true });
  assert.ok(p.ops.some((o) => o.kind === 'keepStub'));
  assert.ok(!p.ops.some((o) => o.kind === 'write' && o.path === 'AGENTS.md'));
});

test('placement flip root->nested rewrites the stub instead of keeping a pruned file', () => {
  // Prior install was --placement root: AGENTS.md held the real core and is in the
  // manifest. Reinstalling nested makes AGENTS.md an orphan (pruned); the stub must
  // be written fresh, not kept against the file the prune deletes.
  const p = buildInstallPlan({ base: '/b', absolute: false, built, adapterPlan, scope: { kind: 'project' },
    flags: { mode: 'split', placement: 'nested', tools: true, dev: false, clean: false, yes: false, dryRun: false },
    prevManifestPaths: ['AGENTS.md'], stubExists: true });
  assert.ok(p.ops.some((o) => o.kind === 'prune' && o.paths.includes('AGENTS.md')), 'old root core pruned');
  assert.ok(p.ops.some((o) => o.kind === 'write' && o.path === 'AGENTS.md'), 'stub written fresh');
  assert.ok(!p.ops.some((o) => o.kind === 'keepStub'), 'no keepStub against a pruned path');
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
    corePath: '.agentsmith/AGENTS.md',
    stubContent: 'STUB', stubOnDiskContent: 'STUB', settingsHasOwned: true, hasClaudeMd: true, isUser: true });
  const kinds = p.ops.map((o) => o.kind);
  assert.ok(kinds.includes('prune'));
  assert.ok(kinds.includes('unmergeSettings'));
  assert.ok(kinds.includes('removeImport'));
  assert.ok(p.ops.some((o) => o.kind === 'prune' && o.paths.includes('.claude/skills/x/SKILL.md')));
  assert.equal(p.manifestPaths.length, 0);
});

test('removeImport carries the actual core target, so a root-placement import is matchable', () => {
  const nested = buildUninstallPlan({ base: '/home', absolute: true, manifestPaths: ['.agentsmith/AGENTS.md'],
    corePath: '.agentsmith/AGENTS.md',
    stubContent: 'STUB', stubOnDiskContent: null, settingsHasOwned: false, hasClaudeMd: true, isUser: true });
  assert.equal(nested.ops.find((o) => o.kind === 'removeImport').target, '.agentsmith/AGENTS.md');

  const root = buildUninstallPlan({ base: '/home', absolute: true, manifestPaths: ['AGENTS.md'],
    corePath: 'AGENTS.md',
    stubContent: 'STUB', stubOnDiskContent: null, settingsHasOwned: false, hasClaudeMd: true, isUser: true });
  assert.equal(root.ops.find((o) => o.kind === 'removeImport').target, 'AGENTS.md');
});

test('uninstall skips the stub branch when AGENTS.md is a manifest path (--placement root)', () => {
  const p = buildUninstallPlan({ base: '/b', absolute: false, manifestPaths: ['AGENTS.md'],
    stubContent: 'STUB', stubOnDiskContent: 'FULL CORE', settingsHasOwned: false, hasClaudeMd: false, isUser: false });
  assert.ok(!p.ops.some((o) => o.kind === 'keepStub'), 'no spurious keepStub for a pruned root core');
  assert.ok(p.ops.some((o) => o.kind === 'prune' && o.paths.includes('AGENTS.md')), 'root core still pruned');
});

test('uninstall keeps an edited stub', () => {
  const p = buildUninstallPlan({ base: '/home', absolute: true, manifestPaths: [],
    stubContent: 'STUB', stubOnDiskContent: 'EDITED BY USER', settingsHasOwned: false, hasClaudeMd: false, isUser: false });
  assert.ok(p.ops.some((o) => o.kind === 'keepStub'));
});

test('install and uninstall plans both carry the scope, so renderPlan can state it', () => {
  const install = buildInstallPlan({ base: '/b', absolute: false, built, adapterPlan, scope: { kind: 'project' },
    flags: { mode: 'split', placement: 'nested', tools: true, dev: false, clean: false, yes: false, dryRun: false },
    prevManifestPaths: [], stubExists: false });
  assert.deepEqual(install.scope, { kind: 'project' });

  const uninstall = buildUninstallPlan({ base: '/home', absolute: true, manifestPaths: [], scope: { kind: 'user' },
    stubContent: 'STUB', stubOnDiskContent: null, settingsHasOwned: false, hasClaudeMd: false, isUser: true });
  assert.deepEqual(uninstall.scope, { kind: 'user' });
});

test('renderPlan states the scope kind and the absolute base it resolved to', () => {
  const line = (scope, base) => renderPlan({ base, absolute: true, scope, manifestPaths: [], ops: [
    { kind: 'write', path: '.agentsmith/AGENTS.md' },
  ] }).split('\n')[1];

  assert.equal(line({ kind: 'project' }, '/repo'), '  Scope: project (/repo)');
  assert.equal(line({ kind: 'user' }, '/home/vinic'), '  Scope: user (/home/vinic)');
  // A --scope PATH install reads as `folder` -- 'path' is the internal enum.
  assert.equal(line({ kind: 'path', path: '../sibling' }, '/repos/sibling'), '  Scope: folder (/repos/sibling)');
});

test('renderPlan states the scope before the destructive delete line', () => {
  const out = renderPlan({ base: '/home/vinic', absolute: true, scope: { kind: 'user' }, manifestPaths: [], ops: [
    { kind: 'prune', paths: ['.agentsmith/AGENTS.md'] },
  ] });
  const scopeAt = out.indexOf('Scope: user');
  const deleteAt = out.indexOf('DELETE');
  assert.ok(scopeAt >= 0, 'scope line present');
  assert.ok(deleteAt >= 0, 'delete line present');
  assert.ok(scopeAt < deleteAt, 'scope precedes what is about to be deleted');
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

test('renderPlan lists every delete (no truncation) so a destructive confirm hides nothing', () => {
  const paths = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'];
  const out = renderPlan({ base: '/b', absolute: false, manifestPaths: [], ops: [{ kind: 'prune', paths }] });
  for (const f of paths) assert.match(out, new RegExp(f), `${f} listed`);
  assert.doesNotMatch(out, /\.\.\./, 'no truncation ellipsis on the delete line');
});
