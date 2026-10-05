#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { buildOutputs } from '../src/build.js';
import { resolveSections, demoteForBasename } from '../src/sections.js';
import { planToolInstall } from '../src/tools.js';
import { readManifest, writeManifest } from '../src/manifest.js';
import { sourceRevision } from '../src/revision.js';
import { parseArgs } from '../src/args.js';
import { buildInstallPlan, buildUninstallPlan, renderPlan } from '../src/plan.js';
import { applyPlan } from '../src/execute.js';
import { confirm, runWizard, makeSeam } from '../src/prompt.js';
import { SETTINGS_REL, CLAUDE_MD_REL, hasOwnedHooks } from '../src/settings.js';
import {
  applyLayoutOverrides,
  definesLayoutTag,
  parseLayoutConfig,
  parseLayoutTable,
  readLayoutConfig,
  withRowPolicy,
} from '../src/docslayout.js';

// Resolve sources relative to the package, not the consumer's cwd.
const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(pkgRoot, 'manifest.json'), 'utf8'));
const read = (rel) => readFileSync(join(pkgRoot, rel), 'utf8');
const pkgVersion = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')).version;

const HELP = `agentsmith -- forge AGENTS.md for any project

Usage:
  agentsmith install   [--scope <user|project|PATH>] [--mode <single|split>] [--placement <root|nested>] [--no-tools] [--dev] [--clean] [--yes] [--dry-run]
  agentsmith uninstall [--scope <user|project|PATH>] [--yes] [--dry-run]
  agentsmith --stdout  [--mode <single|split>]
  agentsmith                       (bare: interactive wizard)

Scope: 'project' (cwd, default), 'user' (home), or a directory path.
       A directory literally named user/project is reached as ./user.
Examples:
  agentsmith install
  agentsmith install --scope user
  agentsmith uninstall --scope user --yes`;

// Per-verb help: the verb's synopsis, its own flags, and one example. Reached via
// `agentsmith install --help` / `uninstall --help` (parseArgs sets cmd.helpVerb).
const VERB_HELP = {
  install: `agentsmith install -- generate instructions (and tool adapters) under a scope

Usage:
  agentsmith install [--scope <user|project|PATH>] [--mode <single|split>] [--placement <root|nested>] [--no-tools] [--dev] [--clean] [--yes] [--dry-run]

Flags:
  --scope <user|project|PATH>  base directory the install tree roots at (default project)
  --mode <single|split>        one inlined file vs. lean core + one file per bundle (default split)
  --placement <root|nested>    core at base root vs. nested under .agentsmith/ with a stub (default nested)
  --no-tools                   skip the tool adapters; write instructions only
  --dev                        also install the authoring-only devtools adapter
  --clean                      uninstall then reinstall this scope in one run (destructive)
  --yes                        skip the confirmation prompt (durable authorization)
  --dry-run                    print the plan and exit 0 without writing

Config:
  reads .agentsmith/docs-layout.yaml to remap the docs layout; see README

Example:
  agentsmith install --scope user`,
  uninstall: `agentsmith uninstall -- reverse an install of the same scope

Usage:
  agentsmith uninstall [--scope <user|project|PATH>] [--yes] [--dry-run]

Flags:
  --scope <user|project|PATH>  base directory to uninstall from (default project)
  --yes                        skip the confirmation prompt (durable authorization)
  --dry-run                    print the plan and exit 0 without writing

Example:
  agentsmith uninstall --scope user --yes`,
};

const helpFor = (verb) => VERB_HELP[verb] ?? HELP;

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

// Recursive module lister: ordered { path, demote } for a section's subtree.
// A branch dir (only subdirs) recurses alphabetically; a leaf dir emits
// _intro.md first then tag files alphabetically. demote: _intro -> 1, tag -> 2.
export function makeListModules(root) {
  return function listModules(name) {
    const out = [];
    const walk = (absDir, relDir) => {
      const entries = readdirSync(absDir, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
      const files = entries.filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name);
      if (dirs.length && files.length) {
        // The tree is two-level by construction: a dir is EITHER a branch (only
        // subdirs) OR a leaf group (_intro.md + tag files). A mix would silently
        // drop the files, so fail loud rather than miscompile the output.
        throw new Error(`agentsmith: mixed branch/leaf dir (subdirs + .md files): ${relDir}`);
      }
      if (dirs.length) {
        for (const d of dirs) walk(join(absDir, d), `${relDir}/${d}`);
        return;
      }
      const ordered = files.filter((f) => f === '_intro.md')
        .concat(files.filter((f) => f !== '_intro.md').sort());
      for (const f of ordered) out.push({ path: `${relDir}/${f}`, demote: demoteForBasename(f) });
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

const { commit, date } = sourceRevision({ pkgRoot, pkgVersion });

// Bounded so a hung git never stalls install (#swe-async); the probe is advisory.
const GITIGNORE_PROBE_TIMEOUT_MS = 5000;

const NO_OUTPUT = 'no output was generated';
const LAYOUT_RULE_MISSING =
  'the #swe-docs-layout rule is not in the generated instruction set, so .agentsmith/docs-layout.yaml cannot be applied';

// Read and validate <base>/.agentsmith/docs-layout.yaml, exiting 1 on any problem
// before a byte of output is generated. `knownRows` come from the module that defines
// #swe-docs-layout, which `definesLayoutTag` identifies by its heading, so a typo'd tag
// is rejected against the shipped table rather than silently ignored -- deny-by-default,
// including the arm where a config exists but the rule is not in the emitted set.
// Project-dependent rule content: see the design decision `project-dependent-rule-content`.
function readLayoutOverrides(base, moduleTexts) {
  const die = (why) => {
    process.stderr.write(`agentsmith: error -- ${why}${why.includes(NO_OUTPUT) ? '' : `; ${NO_OUTPUT}`}\n`);
    process.exit(1);
  };
  let config;
  try { config = readLayoutConfig({ base }); } catch (e) { die(e.message); }
  if (config.text.trim() === '') return { file: config.file, overrides: {} };
  const mapText = moduleTexts.find(definesLayoutTag);
  if (mapText === undefined) die(LAYOUT_RULE_MISSING);
  try { return { file: config.file, overrides: parseLayoutConfig(config.text, withRowPolicy(parseLayoutTable(mapText)), config.file) }; }
  catch (e) { die(e.message); }
}

// Warn when git reports the config ignored: the README's recipe ignores .agentsmith/
// wholesale, so teammates would never receive the layout. Advisory only -- exit 0
// (ignored) warns; exit 1 (not ignored), git missing, exit 128, a timeout or any
// other failure is a silent skip. No shell: the path is a single argv element.
function warnIfConfigIgnored(base, file) {
  const configPath = join(base, file);
  if (!existsSync(configPath)) return;
  try {
    execFileSync('git', ['check-ignore', '-q', '--', configPath], {
      cwd: base, timeout: GITIGNORE_PROBE_TIMEOUT_MS, stdio: 'ignore', windowsHide: true,
    });
  } catch { return; }
  process.stderr.write(
    `agentsmith: warning -- ${file} is gitignored, so teammates will not get this layout. Add '!${file}' after '.agentsmith/*' in .gitignore (see README).\n`,
  );
}

// computeAdapterPlan wraps listToolSources + planToolInstall (dev adds devtools/claude).
function computeAdapterPlan(dev) {
  const sources = listToolSources(join(pkgRoot, 'tools'), 'tools');
  if (dev) sources.push(...listToolSources(join(pkgRoot, 'devtools', 'claude'), 'devtools/claude'));
  return planToolInstall(sources);
}

async function main() {
  let cmd = parseArgs(process.argv.slice(2));
  const seam = makeSeam();

  if (cmd.kind === 'wizard') {
    if (!seam.isTTY) { process.stderr.write(`agentsmith: error -- no subcommand -- run 'agentsmith install' or 'agentsmith --help'\n`); process.exit(1); }
    cmd = await runWizard(seam);
  }
  if (cmd.kind === 'aborted') { process.stderr.write(`agentsmith: aborted -- no recognized answer\n`); process.exit(0); }
  if (cmd.kind === 'error') { process.stderr.write(`${cmd.error}\n`); process.exit(1); }
  if (cmd.kind === 'help') { process.stdout.write(`${cmd.helpVerb ? helpFor(cmd.helpVerb) : HELP}\n`); process.exit(0); }
  if (cmd.kind === 'version') { process.stdout.write(`${pkgVersion}\n`); process.exit(0); }

  // Build outputs from the parsed flags. --mode drives layout; --placement the
  // core location (absent on uninstall/stdout -> nested default).
  const layout = cmd.flags.mode === 'single' ? 'full' : 'lean';
  const placement = cmd.flags.placement ?? 'nested';

  // Module texts are read before the scope block below, because the config read
  // takes its known rows from the layout table in the rule source, and because
  // buildOutputs is handed the already-transformed texts (one application site).
  const coreTexts = coreModules.map(({ path, demote }) => ({ text: read(path), demote }));
  const bundleTexts = bundles.map((b) => ({
    name: b.name,
    title: b.title,
    when: b.when,
    modules: b.modules.map(({ path, demote }) => ({ text: read(path), demote })),
  }));

  // Scope -> base + absolute, and the docs-layout config, both hoisted above
  // buildOutputs so a malformed config exits before any output exists. The block is
  // guarded because parseArgs gives kind 'stdout' no scope field at all, and because
  // --stdout is a pure generate-and-print query that reads no config
  // (docs/reference-spec/cli.md): overrides stay empty on that path.
  let isUser = false;
  let base;
  let absolute = false;
  let overrides = {};
  let layoutFile;
  if (cmd.kind !== 'stdout') {
    isUser = cmd.scope.kind === 'user';
    base = isUser ? homedir() : cmd.scope.kind === 'path' ? resolve(process.cwd(), cmd.scope.path) : process.cwd();
    absolute = isUser || cmd.scope.kind === 'path';
    if (cmd.scope.kind === 'path' && existsSync(base) && !statSync(base).isDirectory()) {
      process.stderr.write(`agentsmith: error -- --scope path is not a directory: ${base}\n`); process.exit(1);
    }
    // Install only. An uninstall writes no map, so reading the config there would
    // let a stale or malformed one -- a tag agentsmith renamed in a later release,
    // say -- block the user from removing an install it does not consult.
    if (cmd.kind === 'install') {
      const allTexts = [...coreTexts, ...bundleTexts.flatMap((b) => b.modules)].map((m) => m.text);
      ({ overrides, file: layoutFile } = readLayoutOverrides(base, allTexts));
    }
  }

  // The single application site: every module text, core and bundle, is mapped
  // through the transform, which self-selects on the tag.
  const remap = ({ text, demote }) => ({ text: applyLayoutOverrides({ moduleText: text, overrides }), demote });
  const built = buildOutputs({
    preamble: read(manifest.preamble),
    modules: coreTexts.map(remap),
    bundles: bundleTexts.map((b) => ({
      name: b.name,
      title: b.title,
      when: b.when,
      modules: b.modules.map(remap),
    })),
    source: manifest.source,
    commit,
    date,
    layout,
    placement,
    output: manifest.output,
  });

  if (built.dangling.length) {
    process.stderr.write(
      `agentsmith: warning -- unresolved #tag references: ${built.dangling.join(', ')}\n`,
    );
  }
  if (built.crossBoundary.length) {
    const list = built.crossBoundary
      .map((c) => `#${c.from || '(core preamble)'} -> bundle-only #${c.tag}`)
      .join(', ');
    process.stderr.write(
      `agentsmith: warning -- core rule references a bundle-only #tag: ${list}\n`,
    );
  }

  if (cmd.kind === 'stdout') { process.stdout.write(built.coreContent); process.exit(0); }

  // Whether settings.json already carries an agentsmith-owned hook, so the plan
  // emits an un-merge only when there is something of ours to remove.
  const settingsPath = resolve(base, SETTINGS_REL);
  let settingsHasOwned = false;
  if (existsSync(settingsPath)) {
    try { settingsHasOwned = hasOwnedHooks(JSON.parse(readFileSync(settingsPath, 'utf8'))); } catch { /* malformed -> treat as none */ }
  }

  if (cmd.kind === 'uninstall' || (cmd.kind === 'install' && cmd.flags.clean)) {
    const prev = readManifest(base);
    const stubDest = resolve(base, 'AGENTS.md');
    // Derive the prior install's core path from what the manifest recorded, not
    // from this run's flags: uninstall has no --placement flag, so a bare
    // uninstall would otherwise always assume the nested default and miss a
    // --placement root import (correctness-3). AGENTS.md at the root => root core.
    const prevCorePath = prev.paths.includes('AGENTS.md') ? 'AGENTS.md' : '.agentsmith/AGENTS.md';
    const plan = buildUninstallPlan({
      base, absolute, scope: cmd.scope, manifestPaths: prev.paths, corePath: prevCorePath,
      stubContent: built.stub ? built.stub.content : null,
      stubOnDiskContent: existsSync(stubDest) ? readFileSync(stubDest, 'utf8') : null,
      settingsHasOwned,
      hasClaudeMd: existsSync(resolve(base, CLAUDE_MD_REL)),
      isUser,
    });
    if (cmd.kind === 'uninstall') {
      const decision = await confirm({ plan, seam, yes: cmd.flags.yes, dryRun: cmd.flags.dryRun, destructive: true, render: renderPlan });
      if (decision === 'abort') { process.stderr.write(`agentsmith: error -- refusing to uninstall without confirmation -- pass --yes\n`); process.exit(1); }
      if (decision === 'skip') process.exit(0);
      applyPlan(plan, { pkgRoot });
      process.exit(0);
    }
    // install --clean: apply uninstall first (confirmed as destructive), then fall through to install.
    const decision = await confirm({ plan, seam, yes: cmd.flags.yes, dryRun: cmd.flags.dryRun, destructive: true, render: renderPlan });
    if (decision === 'abort') { process.stderr.write(`agentsmith: error -- refusing to clean-install without confirmation -- pass --yes\n`); process.exit(1); }
    // A dry-run clean previews BOTH halves: skip the uninstall apply/early-exit and
    // fall through so the install block below builds, prints, and (being dry-run)
    // exits 0 without writing. A real skip (TTY 'n') still exits here.
    if (!cmd.flags.dryRun) {
      if (decision === 'skip') process.exit(0);
      applyPlan(plan, { pkgRoot });
    }
  }

  // install (fresh, or the install half of --clean).
  const adapterPlan = cmd.flags.tools ? computeAdapterPlan(cmd.flags.dev) : [];
  const installPlan = buildInstallPlan({
    base, absolute, built, adapterPlan, scope: cmd.scope, flags: cmd.flags,
    prevManifestPaths: readManifest(base).paths, stubExists: existsSync(resolve(base, 'AGENTS.md')),
    settingsHasOwned, layout: { file: layoutFile, overrides },
  });
  // Install plans only (on --clean this is the second plan, the one that writes the
  // remapped map); --scope user never probes, since the user's home is not a repo.
  if (!isUser) warnIfConfigIgnored(base, layoutFile);
  const decision = await confirm({ plan: installPlan, seam, yes: cmd.flags.yes, dryRun: cmd.flags.dryRun, destructive: false, render: renderPlan });
  if (decision === 'skip') process.exit(0);
  applyPlan(installPlan, { pkgRoot });
  writeManifest(base, installPlan.manifestPaths, new Date().toISOString());
}

// Run the pipeline only when invoked as the CLI, not when a module (e.g. a test)
// imports makeListModules from this file. Resolve process.argv[1] through realpath:
// npm installs the bin as a `.bin/agentsmith` symlink, and Node's ESM loader
// canonicalizes import.meta.url through realpath, so on the npx / global-symlink
// launch (the primary advertised entry) the raw paths differ and main() would be
// skipped -- a silent exit 0. realpathSync collapses the symlink so they match.
const entry = process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href;
if (import.meta.url === entry) {
  main().catch((e) => { process.stderr.write(`agentsmith: ${e.message}\n`); process.exit(1); });
}
