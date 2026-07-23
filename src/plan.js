import { orphanPaths } from './manifest.js';
import { HOOK_REL } from './settings.js';

// buildInstallPlan: assemble the ordered op list for an install (pure).
export function buildInstallPlan({ base, absolute, built, adapterPlan, scope, flags, prevManifestPaths, stubExists }) {
  const ops = [];
  const manifestPaths = [
    built.corePath,
    ...built.bundles.map((b) => b.path),
    ...adapterPlan.map((p) => p.dest),
  ];

  const orphans = orphanPaths(prevManifestPaths, manifestPaths);
  if (orphans.length) ops.push({ kind: 'prune', paths: orphans });

  ops.push({ kind: 'write', path: built.corePath, content: built.coreContent });
  for (const b of built.bundles) ops.push({ kind: 'write', path: b.path, content: b.content });

  // Root stub: write-once (project + nested only). Kept if present.
  if (built.stub) {
    ops.push(stubExists ? { kind: 'keepStub', path: built.stub.path } : { kind: 'write', path: built.stub.path, content: built.stub.content });
  }

  // Adapter files.
  for (const a of adapterPlan) ops.push({ kind: 'write', path: a.dest, src: a.src });

  // User-scope import wiring.
  if (scope.kind === 'user') ops.push({ kind: 'writeImport', path: '.claude/CLAUDE.md', target: built.corePath });

  // settings.json: merge our hook when tools installed, else un-merge any stale entry (bug-2 fix).
  const commandPath = absolute ? HOOK_REL : HOOK_REL; // resolved to absolute by execute when absolute=true
  ops.push(flags.tools
    ? { kind: 'mergeSettings', path: '.claude/settings.json', commandPath }
    : { kind: 'unmergeSettings', path: '.claude/settings.json' });

  return { base, absolute, ops, manifestPaths };
}

// buildUninstallPlan: reverse an install of the same scope (pure).
export function buildUninstallPlan({ base, absolute, manifestPaths, stubContent, stubOnDiskContent, hasSettings, hasClaudeMd, isUser }) {
  const ops = [];
  if (manifestPaths.length) ops.push({ kind: 'prune', paths: manifestPaths });
  if (hasSettings) ops.push({ kind: 'unmergeSettings', path: '.claude/settings.json' });
  if (isUser && hasClaudeMd) ops.push({ kind: 'removeImport', path: '.claude/CLAUDE.md' });
  // Root stub: delete only if unmodified; else keep.
  if (stubOnDiskContent != null) {
    ops.push(stubOnDiskContent === stubContent ? { kind: 'prune', paths: ['AGENTS.md'] } : { kind: 'keepStub', path: 'AGENTS.md' });
  }
  ops.push({ kind: 'prune', paths: ['.agentsmith/.install-manifest.json'] });
  return { base, absolute, ops, manifestPaths: [] };
}

const REL = (p) => p.replace(/\\/g, '/');

// renderPlan: user-facing text. Internal op names never printed; deletes marked distinctly.
export function renderPlan(plan) {
  const writes = [];
  const deletes = [];
  const updates = [];
  const keeps = [];
  for (const op of plan.ops) {
    if (op.kind === 'write') writes.push(REL(op.path));
    else if (op.kind === 'prune') deletes.push(...op.paths.map(REL));
    else if (op.kind === 'mergeSettings') updates.push(`${REL(op.path)} (add agentsmith hook)`);
    else if (op.kind === 'unmergeSettings') updates.push(`${REL(op.path)} (remove agentsmith hook)`);
    else if (op.kind === 'writeImport') updates.push(`${REL(op.path)} (add agentsmith import)`);
    else if (op.kind === 'removeImport') updates.push(`${REL(op.path)} (remove agentsmith import)`);
    else if (op.kind === 'keepStub' || op.kind === 'keepImport') keeps.push(REL(op.path));
  }
  const lines = ['agentsmith plan:'];
  if (writes.length) lines.push(`  write   ${writes.length} file(s): ${writes.slice(0, 3).join(', ')}${writes.length > 3 ? ', ...' : ''}`);
  for (const u of updates) lines.push(`  update  ${u}`);
  if (deletes.length) lines.push(`  DELETE  ${deletes.length} file(s): ${deletes.slice(0, 3).join(', ')}${deletes.length > 3 ? ', ...' : ''}`);
  for (const k of keeps) lines.push(`  keep    ${k} (unchanged)`);
  return lines.join('\n');
}
