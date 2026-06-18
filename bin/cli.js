#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { buildOutputs } from '../src/build.js';
import { resolveSections } from '../src/sections.js';
import { planToolInstall } from '../src/tools.js';
import { userImport } from '../src/userimport.js';
import { mergeSettings, agentsmithHooks, HOOK_REL } from '../src/settings.js';

// Resolve sources relative to the package, not the consumer's cwd.
const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(pkgRoot, 'manifest.json'), 'utf8'));
const read = (rel) => readFileSync(join(pkgRoot, rel), 'utf8');

// Stamp the header with the source revision. Describes the instruction repo
// (pkgRoot), not the consumer's project. Silently skipped outside a git repo.
function sourceRevision() {
  // Ignore stderr so a missing .git (e.g. installed via npx, no repo) stays silent.
  const git = (args) =>
    execFileSync('git', args, { cwd: pkgRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  try {
    const commit = git(['rev-parse', '--short', 'HEAD']);
    const date = git(['log', '-1', '--format=%cd', '--date=short']);
    const dirty = git(['status', '--porcelain']) !== '';
    return { commit: dirty ? `${commit}-dirty` : commit, date };
  } catch {
    return {};
  }
}

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const layout = has('--full') || has('--inline') ? 'full' : 'lean';
const placement = has('--root') ? 'root' : 'nested';
const installTools = !has('--no-tools');
const userScope = has('--user');

// Every *.md (and any file) under tools/, relative to pkgRoot, recursively.
function listToolSources(absDir, relBase) {
  if (!existsSync(absDir)) return [];
  const out = [];
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const abs = join(absDir, entry.name);
    const rel = `${relBase}/${entry.name}`;
    if (entry.isDirectory()) out.push(...listToolSources(abs, rel));
    else out.push(rel);
  }
  return out;
}
const outIdx = args.indexOf('--out');
const out = outIdx !== -1 ? args[outIdx + 1] : undefined;
if (outIdx !== -1 && (out === undefined || out.startsWith('--'))) {
  process.stderr.write('agentsmith: error -- --out requires a path argument\n');
  process.exit(1);
}

// Recursive module lister: ordered { path, demote } for a section's subtree.
// A branch dir (only subdirs) recurses alphabetically; a leaf dir emits
// _intro.md first then tag files alphabetically. demote: _intro -> 1, tag -> 2.
export function makeListModules(root) {
  return function listModules(name) {
    const out = [];
    const walk = (absDir, relDir) => {
      const entries = readdirSync(absDir, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
      if (dirs.length) {
        for (const d of dirs) walk(join(absDir, d), `${relDir}/${d}`);
        return;
      }
      const files = entries.filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name);
      const ordered = files.filter((f) => f === '_intro.md')
        .concat(files.filter((f) => f !== '_intro.md').sort());
      for (const f of ordered) out.push({ path: `${relDir}/${f}`, demote: f === '_intro.md' ? 1 : 2 });
    };
    walk(join(root, 'instructions', name), `instructions/${name}`);
    return out;
  };
}

const listModules = makeListModules(pkgRoot);
const { coreModules, bundles } = resolveSections({
  sections: manifest.sections || [],
  listModules,
});

for (const b of bundles) {
  if (!b.modules.length) {
    process.stderr.write(`agentsmith: warning -- section "${b.name}" has no .md files\n`);
  }
}

const { commit, date } = sourceRevision();
const built = buildOutputs({
  preamble: read(manifest.preamble),
  modules: coreModules.map(({ path, demote }) => ({ text: read(path), demote })),
  bundles: bundles.map((b) => ({
    name: b.name,
    title: b.title,
    when: b.when,
    modules: b.modules.map(({ path, demote }) => ({ text: read(path), demote })),
  })),
  source: manifest.source,
  commit,
  date,
  layout,
  placement,
  output: manifest.output,
  out,
});

if (built.dangling.length) {
  process.stderr.write(
    `agentsmith: warning -- unresolved #tag references: ${built.dangling.join(', ')}\n`,
  );
}

if (built.crossBoundary.length) {
  process.stderr.write(
    `agentsmith: warning -- core references bundle-only #tag(s): ${built.crossBoundary.join(', ')}\n`,
  );
}

const writeAbs = (dest, content) => {
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content);
  process.stderr.write(`agentsmith: wrote ${dest}\n`);
};

// Merge agentsmith's owned hooks into <base>/.claude/settings.json without clobbering
// the consumer's own settings. Project installs use a project-relative command (hooks
// run from the project root); user installs need the absolute home path (a user hook's
// cwd is the active project, not home). Idempotent across reinstalls.
const installSettings = (base, { absolute }) => {
  const dest = resolve(base, '.claude/settings.json');
  let existing = null;
  if (existsSync(dest)) {
    try {
      existing = JSON.parse(readFileSync(dest, 'utf8'));
    } catch {
      process.stderr.write(`agentsmith: warning -- ${dest} is not valid JSON; left untouched\n`);
      return;
    }
  }
  const commandPath = absolute ? resolve(base, HOOK_REL) : HOOK_REL;
  const next = mergeSettings(existing, agentsmithHooks(commandPath));
  writeAbs(dest, `${JSON.stringify(next, null, 2)}\n`);
};

// Install tool adapters (tools/<ai>/** -> <base>/.<ai>/**). Namespaced and
// non-destructive: only the adapter's own files are written.
const installAdapters = (base, { absolute }) => {
  if (!installTools) return;
  const sources = listToolSources(join(pkgRoot, 'tools'), 'tools');
  for (const { src, dest } of planToolInstall(sources)) {
    writeAbs(resolve(base, dest), readFileSync(join(pkgRoot, src)));
  }
  // Wire settings after the hook script is on disk, so it never references a missing file.
  installSettings(base, { absolute });
};

if (has('--stdout')) {
  process.stdout.write(built.coreContent);
} else if (userScope) {
  // User scope: write the generated instructions under the home directory, wire
  // ~/.claude/CLAUDE.md to import them, and install adapters for all projects.
  const base = homedir();
  writeAbs(resolve(base, built.corePath), built.coreContent);
  for (const bundle of built.bundles) writeAbs(resolve(base, bundle.path), bundle.content);

  // Wire the import before installing adapters, so a later adapter-file error
  // cannot leave instructions written but unwired.
  const claudeMd = resolve(base, '.claude/CLAUDE.md');
  const target = resolve(base, built.corePath).replace(/\\/g, '/');
  const existing = existsSync(claudeMd) ? readFileSync(claudeMd, 'utf8') : null;
  const next = userImport(existing, target);
  if (next !== null) writeAbs(claudeMd, next);
  else process.stderr.write(`agentsmith: kept existing import in ${claudeMd}\n`);

  installAdapters(base, { absolute: true });
} else {
  const cwd = process.cwd();
  writeAbs(resolve(cwd, built.corePath), built.coreContent);
  for (const bundle of built.bundles) writeAbs(resolve(cwd, bundle.path), bundle.content);

  if (built.stub) {
    const stubDest = resolve(cwd, built.stub.path);
    if (existsSync(stubDest)) {
      process.stderr.write(`agentsmith: kept existing ${stubDest}\n`);
    } else {
      writeAbs(stubDest, built.stub.content);
    }
  }

  installAdapters(cwd, { absolute: false });
}
