#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { buildOutputs } from '../src/build.js';

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
const outIdx = args.indexOf('--out');
const out = outIdx !== -1 ? args[outIdx + 1] : undefined;

const { commit, date } = sourceRevision();
const built = buildOutputs({
  preamble: read(manifest.preamble),
  modules: manifest.modules.map(read),
  bundles: (manifest.bundles || []).map((b) => ({
    name: b.name,
    title: b.title,
    when: b.when,
    modules: b.modules.map(read),
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

if (has('--stdout')) {
  process.stdout.write(built.coreContent);
} else {
  const writeOut = (rel, content) => {
    const dest = resolve(process.cwd(), rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
    process.stderr.write(`agentsmith: wrote ${dest}\n`);
  };

  writeOut(built.corePath, built.coreContent);
  for (const bundle of built.bundles) writeOut(bundle.path, bundle.content);

  if (built.stub) {
    const stubDest = resolve(process.cwd(), built.stub.path);
    if (existsSync(stubDest)) {
      process.stderr.write(`agentsmith: kept existing ${stubDest}\n`);
    } else {
      writeOut(built.stub.path, built.stub.content);
    }
  }
}
