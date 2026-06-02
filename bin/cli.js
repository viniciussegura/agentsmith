#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { buildOutputs } from '../src/build.js';
import { resolveSections } from '../src/sections.js';
import { planToolInstall } from '../src/tools.js';

// Resolve sources relative to the package, not the consumer's cwd.
const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(pkgRoot, 'manifest.json'), 'utf8'));
const read = (rel) => readFileSync(join(pkgRoot, rel), 'utf8');

// Stamp the header with the source revision. Describes the instruction repo
// (pkgRoot), not the consumer's project. Silently skipped outside a git repo.
function sourceRevision() {
  const git = (args) => execFileSync('git', args, { cwd: pkgRoot }).toString().trim();
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

// A section's files are every *.md in instructions/<name>/, sorted for
// deterministic output, unless the section pins an explicit `modules` order.
const listFiles = (name) =>
  readdirSync(join(pkgRoot, 'instructions', name))
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => `instructions/${name}/${f}`);

const { coreModulePaths, bundles } = resolveSections({
  sections: manifest.sections || [],
  listFiles,
});

for (const b of bundles) {
  if (!b.modulePaths.length) {
    process.stderr.write(`agentsmith: warning -- section "${b.name}" has no .md files\n`);
  }
}

const { commit, date } = sourceRevision();
const built = buildOutputs({
  preamble: read(manifest.preamble),
  modules: coreModulePaths.map(read),
  bundles: bundles.map((b) => ({
    name: b.name,
    title: b.title,
    when: b.when,
    modules: b.modulePaths.map(read),
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

// Install tool adapters (tools/<ai>/** -> <base>/.<ai>/**). Namespaced and
// non-destructive: only the adapter's own files are written.
const installAdapters = (base) => {
  if (!installTools) return;
  const sources = listToolSources(join(pkgRoot, 'tools'), 'tools');
  for (const { src, dest } of planToolInstall(sources)) {
    writeAbs(resolve(base, dest), readFileSync(join(pkgRoot, src)));
  }
};

if (userScope) {
  // User scope: install adapters into the home directory for all projects.
  // The AGENTS.md rule is delivered separately (imported into ~/.claude/CLAUDE.md).
  if (!installTools) {
    process.stderr.write('agentsmith: --user with --no-tools has nothing to install\n');
  }
  installAdapters(homedir());
} else if (has('--stdout')) {
  process.stdout.write(built.coreContent);
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

  installAdapters(cwd);
}
