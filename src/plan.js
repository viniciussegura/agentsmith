import { orphanPaths } from './manifest.js';
import { SETTINGS_REL, CLAUDE_MD_REL } from './settings.js';

// buildInstallPlan: assemble the ordered op list for an install (pure).
export function buildInstallPlan({ base, absolute, built, adapterPlan, scope, flags, prevManifestPaths, stubExists, settingsHasOwned }) {
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

  // Root stub: write-once (project + nested only). Kept if present -- UNLESS the
  // same path is being pruned this run (a --placement root -> nested flip: the old
  // root core at AGENTS.md is an orphan). keepStub would no-op against the file the
  // prune just deleted, so write the stub fresh when its path is a pending orphan.
  if (built.stub) {
    const stubBeingPruned = orphans.includes(built.stub.path);
    ops.push(stubExists && !stubBeingPruned
      ? { kind: 'keepStub', path: built.stub.path }
      : { kind: 'write', path: built.stub.path, content: built.stub.content });
  }

  // Adapter files.
  for (const a of adapterPlan) ops.push({ kind: 'write', path: a.dest, src: a.src });

  // User-scope import wiring.
  if (scope.kind === 'user') ops.push({ kind: 'writeImport', path: CLAUDE_MD_REL, target: built.corePath });

  // settings.json: merge our hook when tools installed, else un-merge -- but only
  // when an owned entry is actually present, so a --no-tools install that never
  // wrote a hook does not re-serialize the file or print a phantom "remove" line.
  // execute.js resolves the hook command path from plan.absolute; nothing to precompute.
  if (flags.tools) ops.push({ kind: 'mergeSettings', path: SETTINGS_REL });
  else if (settingsHasOwned) ops.push({ kind: 'unmergeSettings', path: SETTINGS_REL });

  return { base, absolute, scope, ops, manifestPaths };
}

// buildUninstallPlan: reverse an install of the same scope (pure).
export function buildUninstallPlan({ base, absolute, scope, manifestPaths, corePath, stubContent, stubOnDiskContent, settingsHasOwned, hasClaudeMd, isUser }) {
  const ops = [];
  if (manifestPaths.length) ops.push({ kind: 'prune', paths: manifestPaths });
  // Un-merge only when an owned hook is actually present: a --no-tools install
  // wrote none, and re-serializing settings.json for nothing overstates the plan.
  if (settingsHasOwned) ops.push({ kind: 'unmergeSettings', path: SETTINGS_REL });
  if (isUser && hasClaudeMd) ops.push({ kind: 'removeImport', path: CLAUDE_MD_REL, target: corePath });
  // Root stub: delete only if unmodified; else keep. Skipped when AGENTS.md is
  // already a manifest path (a --placement root install owns the real core there,
  // pruned above) -- avoids a spurious keepStub for a file already deleted.
  if (stubOnDiskContent != null && !manifestPaths.includes('AGENTS.md')) {
    ops.push(stubOnDiskContent === stubContent ? { kind: 'prune', paths: ['AGENTS.md'] } : { kind: 'keepStub', path: 'AGENTS.md' });
  }
  ops.push({ kind: 'prune', paths: ['.agentsmith/.install-manifest.json'] });
  return { base, absolute, scope, ops, manifestPaths: [] };
}

const REL = (p) => p.replace(/\\/g, '/');

// A --scope PATH is `path` internally; readers see `folder`, which is what they typed
// against. `user`/`project` are already the words the flag takes.
const SCOPE_LABEL = { user: 'user', project: 'project', path: 'folder' };

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
    else if (op.kind === 'keepStub') keeps.push(REL(op.path));
  }
  const lines = ['agentsmith plan:'];
  // Scope first: every path below is relative to this base, and a destructive
  // confirmation must never leave the reader guessing WHICH tree it is about to
  // delete from. Absent only for a hand-built plan in a unit test.
  if (plan.scope) lines.push(`  Scope: ${SCOPE_LABEL[plan.scope.kind]} (${plan.base})`);
  if (writes.length) lines.push(`  write   ${writes.length} file(s): ${writes.slice(0, 3).join(', ')}${writes.length > 3 ? ', ...' : ''}`);
  for (const u of updates) lines.push(`  update  ${u}`);
  // Deletes are the dangerous class -- list every one so a destructive confirmation
  // never hides a file behind a truncating '...'. Writes stay capped (safe, additive).
  if (deletes.length) lines.push(`  DELETE  ${deletes.length} file(s): ${deletes.join(', ')}`);
  for (const k of keeps) lines.push(`  keep    ${k} (unchanged)`);
  return lines.join('\n');
}
