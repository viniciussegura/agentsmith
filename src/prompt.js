import { createInterface } from 'node:readline';

/** Real terminal seam: TTY flag + a readline-backed ask. */
export function makeSeam() {
  return {
    isTTY: Boolean(process.stdout.isTTY),
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

/** Interactive wizard -> Command (same shape parseArgs produces). */
export async function runWizard(seam) {
  const verb = (await seam.ask('Install or uninstall? [install]: ')).trim() || 'install';
  const scopeRaw = (await seam.ask('Scope -- project, user, or a path? [project]: ')).trim() || 'project';
  const scope = scopeRaw === 'user' ? { kind: 'user' } : scopeRaw === 'project' ? { kind: 'project' } : { kind: 'path', path: scopeRaw };

  if (verb === 'uninstall') {
    return { kind: 'uninstall', scope, flags: { yes: false, dryRun: false } };
  }
  const mode = (await seam.ask('Content -- split or single? [split]: ')).trim() || 'split';
  const placement = (await seam.ask('Placement -- nested or root? [nested]: ')).trim() || 'nested';
  const tools = yn(await seam.ask('Install tool adapters? [Y/n]: '), true);
  const dev = yn(await seam.ask('Install authoring dev tools? [y/N]: '), false);
  return { kind: 'install', scope, flags: { mode, placement, tools, dev, clean: false, yes: false, dryRun: false } };
}
