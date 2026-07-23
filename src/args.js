// Per-verb known-flag sets. A flag absent from the active verb's set is a hard error.
const VALUE_FLAGS = new Set(['--scope', '--mode', '--placement']);
const INSTALL_FLAGS = new Set(['--scope', '--mode', '--placement', '--no-tools', '--dev', '--clean', '--yes', '--dry-run', '--help']);
const UNINSTALL_FLAGS = new Set(['--scope', '--yes', '--dry-run', '--help']);
const STDOUT_FLAGS = new Set(['--mode']);

const err = (msg) => ({ kind: 'error', error: `agentsmith: error -- ${msg}` });

function parseScope(value) {
  if (value === 'user') return { kind: 'user' };
  if (value === 'project') return { kind: 'project' };
  return { kind: 'path', path: value };
}

// Pull `--flag value` / `--flag` tokens for a verb; validate against `known`.
function collect(tokens, known) {
  const out = { _scope: undefined, _mode: undefined, _placement: undefined, noTools: false, dev: false, clean: false, yes: false, dryRun: false, help: false };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.startsWith('-')) return err(`unexpected argument: ${t}`);
    if (!known.has(t)) return err(`unknown flag: ${t}`);
    if (VALUE_FLAGS.has(t)) {
      const v = tokens[i + 1];
      if (v === undefined || v.startsWith('-')) return err(`${t} requires a value`);
      i++;
      if (t === '--scope') { if (out._scope !== undefined) return err('--scope given more than once'); out._scope = v; }
      if (t === '--mode') out._mode = v;
      if (t === '--placement') out._placement = v;
    } else if (t === '--no-tools') out.noTools = true;
    else if (t === '--dev') out.dev = true;
    else if (t === '--clean') out.clean = true;
    else if (t === '--yes') out.yes = true;
    else if (t === '--dry-run') out.dryRun = true;
    else if (t === '--help') out.help = true;
  }
  return out;
}

/** Parse argv (process.argv.slice(2)) into a Command. Pure. */
export function parseArgs(argv) {
  if (argv.length === 0) return { kind: 'wizard' };
  if (argv[0] === '--help' || argv[0] === '-h') return { kind: 'help' };
  if (argv[0] === '--version') return { kind: 'version' };

  if (argv[0] === '--stdout') {
    const c = collect(argv.slice(1), STDOUT_FLAGS);
    if (c.kind === 'error') return c;
    const mode = c._mode ?? 'split';
    if (mode !== 'single' && mode !== 'split') return err(`--mode must be single|split, got ${mode}`);
    return { kind: 'stdout', flags: { mode } };
  }

  const verb = argv[0];
  if (verb !== 'install' && verb !== 'uninstall') {
    if (verb.startsWith('-')) return err(`no subcommand -- run 'agentsmith install' or 'agentsmith --help'`);
    return err(`unknown subcommand: ${verb}`);
  }
  const known = verb === 'install' ? INSTALL_FLAGS : UNINSTALL_FLAGS;
  const c = collect(argv.slice(1), known);
  if (c.kind === 'error') return c;
  if (c.help) return { kind: 'help', helpVerb: verb };

  const scope = parseScope(c._scope ?? 'project');
  const mode = c._mode ?? 'split';
  const placement = c._placement ?? 'nested';
  if (mode !== 'single' && mode !== 'split') return err(`--mode must be single|split, got ${mode}`);
  if (placement !== 'nested' && placement !== 'root') return err(`--placement must be nested|root, got ${placement}`);

  const flags = verb === 'install'
    ? { mode, placement, tools: !c.noTools, dev: c.dev, clean: c.clean, yes: c.yes, dryRun: c.dryRun }
    : { yes: c.yes, dryRun: c.dryRun };
  return { kind: verb, scope, flags };
}
