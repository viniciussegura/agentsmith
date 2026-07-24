import { createInterface } from 'node:readline';

/** Real terminal seam: TTY flag + a readline-backed ask. */
export function makeSeam() {
  return {
    isTTY: Boolean(process.stdin.isTTY),
    ask: (question) => new Promise((res) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, (a) => { rl.close(); res(a.trim()); });
    }),
  };
}

/** Decide apply/skip/abort for a plan. Prints the rendered plan first. */
export async function confirm({ plan, seam, yes, dryRun, destructive, render, log = (m) => process.stderr.write(`${m}\n`) }) {
  log(render(plan));
  if (dryRun) return 'skip';
  if (yes) return 'apply';
  if (!seam.isTTY) return destructive ? 'abort' : 'apply';
  const a = (await seam.ask(`Proceed? [y/N] `)).toLowerCase();
  return a === 'y' || a === 'yes' ? 'apply' : 'skip';
}

const yn = (a, dflt) => { const t = a.trim().toLowerCase(); if (t === '') return dflt; return t === 'y' || t === 'yes'; };

// Ask for a value in `allowed`. An empty answer takes `dflt` (undefined = no
// default, so empty is unrecognized). An empty-or-unrecognized answer re-asks
// once; a second bad answer returns null so the wizard aborts rather than
// silently steering into a different action (#swe-errors, correctness-5/swe-5).
async function askEnum(seam, question, allowed, dflt) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = (await seam.ask(question)).trim();
    const val = raw === '' ? dflt : raw;
    if (val && allowed.includes(val)) return val;
  }
  return null;
}

/** Interactive wizard -> Command (same shape parseArgs produces), or an abort. */
export async function runWizard(seam) {
  const verb = await askEnum(seam, 'Install or uninstall? [install/uninstall]: ', ['install', 'uninstall'], undefined);
  if (verb === null) return { kind: 'aborted' };
  const scopeRaw = (await seam.ask('Scope -- project, user, or a path? [project]: ')).trim() || 'project';
  const scope = scopeRaw === 'user' ? { kind: 'user' } : scopeRaw === 'project' ? { kind: 'project' } : { kind: 'path', path: scopeRaw };

  if (verb === 'uninstall') {
    return { kind: 'uninstall', scope, flags: { yes: false, dryRun: false } };
  }
  const mode = await askEnum(seam, 'Content -- split or single? [split]: ', ['single', 'split'], 'split');
  if (mode === null) return { kind: 'aborted' };
  const placement = await askEnum(seam, 'Placement -- nested or root? [nested]: ', ['nested', 'root'], 'nested');
  if (placement === null) return { kind: 'aborted' };
  const tools = yn(await seam.ask('Install tool adapters? [Y/n]: '), true);
  const dev = yn(await seam.ask('Install authoring dev tools? [y/N]: '), false);
  return { kind: 'install', scope, flags: { mode, placement, tools, dev, clean: false, yes: false, dryRun: false } };
}
