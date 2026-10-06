// Shared machinery for agentsmith's PreToolUse hooks. Zero dependencies.
//
// A hook reads the host's payload from stdin, decides, and exits: 2 blocks with a message
// on stderr; 1 allows with a one-line notice on stderr (the host's non-blocking channel) when
// part of the command could not be evaluated; 0 allows silently. A block from any segment wins
// over a notice, and a notice wins over a silent allow. Every payload field is untrusted data:
// matched with linear-time patterns, never evaluated, never echoed into a message.
//
// The hooks are a tripwire for the agent's own commands, not a sandbox. Not covered: git
// aliases; scripts and tools that call git (gh, npm version); wrappers outside WRAPPERS;
// eval, a $VAR command head, and cmd /c; a git pull that merges; heredoc bodies; a second
// clone whose own HEAD carries an opt-out; commands typed by the user. The opt-out file,
// .claude/settings.json, and these scripts are agent-editable; review of the commit that edits
// them is the control.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export const EXIT_ALLOW = 0;
export const EXIT_NOTICE = 1;
export const EXIT_BLOCK = 2;
export const GIT_TIMEOUT_MS = 2000;
export const OPT_OUT_FILE = '.agentsmith/hooks.yaml';
export const HOOK_NAMES = ['require-explicit-model', 'guard-default-branch', 'guard-git-flags', 'guard-dated-todos'];

export function readStdin() {
  return new Promise((done) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { raw += chunk; });
    process.stdin.on('end', () => done(raw));
    process.stdin.on('error', () => done(''));
  });
}

export function parsePayload(raw) {
  try {
    const payload = JSON.parse(raw || 'null');
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------
// Command parsing
// ---------------------------------------------------------------------------------------

const GROUPING = new Set(['(', ')', '{', '}', '!']);
const KEYWORD_HEADS = new Set(['if', 'then', 'elif', 'else', 'do', 'while', 'until', 'fi', 'done']);
const SHELLS = new Set(['bash', 'sh', 'zsh']);
// Bash escapes only these inside double quotes; any other backslash is literal there.
const DOUBLE_QUOTE_ESCAPES = new Set(['$', '`', '"', '\\', '\n']);

// Tokenize one shell command into words and separators. A word is { text, literal };
// literal is false when the word carries a variable, a substitution, or a leading tilde.
function tokenize(command, powershell) {
  const items = [];
  const nested = [];
  let buf = '';
  let started = false;
  let literal = true;
  let inSingle = false;
  let inDouble = false;
  const flush = () => {
    if (started) items.push({ kind: 'word', text: buf, literal });
    buf = ''; started = false; literal = true;
  };
  const push = (ch) => { buf += ch; started = true; };
  const escapeChar = powershell ? '`' : '\\';

  let i = 0;
  while (i < command.length) {
    const ch = command[i];
    if (inSingle) {
      if (ch === "'") inSingle = false; else push(ch);
      i++; continue;
    }
    if (ch === escapeChar && (!inDouble || powershell || DOUBLE_QUOTE_ESCAPES.has(command[i + 1] ?? ''))) {
      if (i + 1 < command.length) { push(command[i + 1]); started = true; i += 2; continue; }
      i++; continue;
    }
    if (ch === '"') { inDouble = !inDouble; started = true; i++; continue; }
    if (!inDouble && ch === "'") { inSingle = true; started = true; i++; continue; }
    if (ch === '$') {
      literal = false; started = true;
      if (command[i + 1] === '(') {
        const end = matchingParen(command, i + 1);
        nested.push(command.slice(i + 2, end));
        i = end + 1; continue;
      }
      if (command[i + 1] === '{') {
        const end = command.indexOf('}', i);
        i = end === -1 ? command.length : end + 1; continue;
      }
      push(ch); i++; continue;
    }
    if (ch === '`' && !powershell) {
      literal = false; started = true;
      const end = command.indexOf('`', i + 1);
      nested.push(command.slice(i + 1, end === -1 ? command.length : end));
      i = end === -1 ? command.length : end + 1; continue;
    }
    if (inDouble) { push(ch); i++; continue; }
    if (ch === '&' && command[i + 1] === '&') { flush(); items.push({ kind: 'sep' }); i += 2; continue; }
    if (ch === '|' && command[i + 1] === '|') { flush(); items.push({ kind: 'sep' }); i += 2; continue; }
    if (ch === ';' || ch === '|' || ch === '&' || ch === '\n') { flush(); items.push({ kind: 'sep' }); i++; continue; }
    if (GROUPING.has(ch) && ch !== '!') { flush(); items.push({ kind: 'word', text: ch, literal: true, grouping: true }); i++; continue; }
    if (/\s/.test(ch)) { flush(); i++; continue; }
    if (ch === '~' && !started) literal = false;
    push(ch); i++;
  }
  flush();
  return { items, nested, unterminated: inSingle || inDouble };
}

function matchingParen(command, open) {
  let depth = 0;
  for (let i = open; i < command.length; i++) {
    if (command[i] === '(') depth++;
    else if (command[i] === ')') { depth--; if (depth === 0) return i; }
  }
  return command.length;
}

// Split a command into segments of words; returns every segment including those nested
// in `bash -c`, `$(...)`, and backticks, the env words that apply, and whether a quote was
// left unterminated anywhere.
export function parseCommand(command, { powershell = false } = {}) {
  const { items, nested, unterminated } = tokenize(String(command), powershell);
  const segments = [];
  let current = [];
  const close = () => {
    while (current.length && (current[0].grouping || current[0].text === '!' || KEYWORD_HEADS.has(current[0].text))) current.shift();
    while (current.length && current[current.length - 1].grouping) current.pop();
    if (current.length) segments.push(current);
    current = [];
  };
  for (const item of items) {
    if (item.kind === 'sep') close(); else current.push(item);
  }
  close();

  const result = { segments: [], unterminated, env: new Map() };
  const absorb = (parsed) => {
    result.segments.push(...parsed.segments);
    result.unterminated = result.unterminated || parsed.unterminated;
    for (const [k, v] of parsed.env) result.env.set(k, v);
  };
  for (const seg of segments) {
    result.segments.push(seg);
    const words = seg.map((w) => w.text);
    for (const w of words) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(w);
      if (!m) break;
      result.env.set(m[1], m[2]);
    }
    if (words[0] === 'export') {
      for (const w of words.slice(1)) {
        const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(w);
        if (m) result.env.set(m[1], m[2]);
      }
    }
    const script = nestedShellScript(words);
    if (script !== null) absorb(parseCommand(script, { powershell: false }));
  }
  for (const text of nested) absorb(parseCommand(text, { powershell }));
  return result;
}

// `bash -c "script"` (also -lc, -ec): the script is the first non-option word after the
// cluster that contains `c`.
function nestedShellScript(words) {
  const head = words[0]?.split(/[\\/]/).pop();
  if (!SHELLS.has(head)) return null;
  let sawC = false;
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    if (/^-[a-zA-Z]+$/.test(w)) { if (w.includes('c')) sawC = true; continue; }
    if (w.startsWith('-')) continue;
    return sawC ? w : null;
  }
  return null;
}

// Wrappers skipped to reach the command head, with the options that take an argument and
// how many bare operands they consume.
const WRAPPERS = {
  env: { args: ['-u', '--unset', '-C', '--chdir', '-S', '--split-string'], envWords: true },
  command: { args: [] },
  exec: { args: ['-a'] },
  time: { args: [] },
  timeout: { args: ['-s', '--signal', '-k', '--kill-after'], operands: 1 },
  nice: { args: ['-n', '--adjustment'] },
  ionice: { args: ['-c', '-n', '-p'] },
  nohup: { args: [] },
  setsid: { args: [] },
  stdbuf: { args: ['-i', '-o', '-e'] },
  sudo: { args: ['-u', '-g', '-C', '-D', '-h', '-p', '-r', '-t', '-U', '-T'] },
  doas: { args: ['-u', '-C'] },
  xargs: { args: ['-n', '-I', '-i', '-P', '-d', '-a', '-E', '-L', '-s'] },
};

const isGitHead = (w) => {
  const norm = w.replace(/\\/g, '/');
  return norm === 'git' || norm.endsWith('/git') || /(^|\/)git\.exe$/i.test(norm);
};

// Advance past leading env words and wrappers; returns the index of the command head.
function headIndex(words) {
  let i = 0;
  for (;;) {
    while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i++;
    const w = words[i];
    if (w === undefined) return i;
    if (w === 'rtk' && words[i + 1] === 'proxy') { i += 2; continue; }
    if (w === 'find') {
      const at = words.findIndex((x, j) => j > i && (x === '-exec' || x === '-execdir'));
      return at === -1 ? i : at + 1;
    }
    const spec = WRAPPERS[w.split(/[\\/]/).pop()];
    if (!spec) return i;
    i++;
    while (i < words.length && (words[i].startsWith('-') || (spec.envWords && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])))) {
      const opt = words[i];
      const key = opt.startsWith('--') ? opt.split('=')[0] : opt.slice(0, 2);
      i++;
      if (spec.args.includes(key) && opt === key) i++;
    }
    i += spec.operands ?? 0;
  }
}

// Git global options that take a separate argument, and those that take none.
const GLOBAL_WITH_ARG = new Set(['-C', '-c', '--config-env', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix']);
const GLOBAL_FLAGS = new Set(['-p', '--paginate', '-P', '--no-pager', '--bare', '--no-replace-objects', '--literal-pathspecs',
  '--glob-pathspecs', '--noglob-pathspecs', '--icase-pathspecs', '--no-optional-locks', '--no-lazy-fetch', '--no-advice']);

// The git invocation a segment makes, or null. `dir` is the -C operand (a word, with its
// literal flag); `dirOverride` is set when --git-dir or --work-tree was passed.
export function gitInvocation(segment) {
  const words = segment.map((w) => w.text);
  const start = headIndex(words);
  if (start >= words.length || !isGitHead(words[start])) return null;
  const inv = { sub: null, args: [], dir: null, dirOverride: false, configs: [], configEnv: [] };
  let i = start + 1;
  while (i < words.length) {
    const w = words[i];
    const eq = w.indexOf('=');
    const key = w.startsWith('--') && eq !== -1 ? w.slice(0, eq) : w;
    const attached = w.startsWith('--') ? (eq !== -1 ? w.slice(eq + 1) : null) : (w.length > 2 && /^-[Cc]/.test(w) ? w.slice(2) : null);
    if (GLOBAL_WITH_ARG.has(key) || (/^-[Cc]./.test(w))) {
      const k = /^-[Cc]/.test(w) ? w.slice(0, 2) : key;
      let value = attached;
      if (value === null) { value = words[i + 1] ?? ''; i++; }
      if (k === '-C') inv.dir = { text: value, literal: segment[i]?.literal !== false };
      else if (k === '-c') inv.configs.push(value);
      else if (k === '--config-env') inv.configEnv.push(value);
      else if (k === '--git-dir' || k === '--work-tree') inv.dirOverride = true;
      i++; continue;
    }
    if (GLOBAL_FLAGS.has(key) || w.startsWith('-')) { i++; continue; }
    inv.sub = w;
    inv.args = words.slice(i + 1);
    return inv;
  }
  return null;
}

// Blocked long options match by unambiguous abbreviation: a `--xyz` token with at least
// three characters after the dashes that prefixes the option is that option.
const LONG_PREFIX_MIN = 5;
export function matchesLong(token, option) {
  const t = token.split('=')[0];
  return t.length >= LONG_PREFIX_MIN && option.startsWith(t);
}

// Scan a short-flag cluster left to right, stopping at the first letter that takes an
// attached argument; true when `letter` is seen before that.
function clusterHas(token, letter, argLetters) {
  if (!/^-[a-zA-Z]+$/.test(token)) return false;
  for (const ch of token.slice(1)) {
    if (ch === letter) return true;
    if (argLetters.includes(ch)) return false;
  }
  return false;
}

const PUSH_FORCE_LONG = ['--force', '--force-with-lease', '--force-if-includes'];
const PUSH_ARG_LETTERS = ['o'];
const COMMIT_ARG_LETTERS = ['m', 'F', 'C', 'c', 't'];
const HOOKS_PATH = /^core\.hookspath(=|$)/i;

// The kind of violation a git invocation carries for guard-git-flags, or null.
export function gitFlagsViolation(inv, env) {
  if (inv.configs.some((c) => HOOKS_PATH.test(c)) || inv.configEnv.some((c) => HOOKS_PATH.test(c))) return 'a core.hooksPath override';
  if (/core\.hookspath/i.test(env.get('GIT_CONFIG_PARAMETERS') ?? '')) return 'a core.hooksPath override';
  for (const [k, v] of env) if (/^GIT_CONFIG_KEY_\d+$/.test(k) && /^core\.hookspath$/i.test(v)) return 'a core.hooksPath override';
  if (inv.sub === 'config' && inv.args.some((a) => /^core\.hookspath$/i.test(a))) return 'a core.hooksPath override';
  for (const a of inv.args) {
    if (a === '--') break;
    if (matchesLong(a, '--no-verify')) return 'a hook-skipping flag';
    if (inv.sub === 'push') {
      if (PUSH_FORCE_LONG.some((o) => matchesLong(a, o))) return 'a force push flag';
      if (a === '-f' || clusterHas(a, 'f', PUSH_ARG_LETTERS)) return 'a force push flag';
      if (a.startsWith('+')) return 'a forced refspec';
    }
    if (inv.sub === 'commit' && (a === '-n' || clusterHas(a, 'n', COMMIT_ARG_LETTERS))) return 'a hook-skipping flag';
  }
  return null;
}

// The directory a git segment runs in: -C, else the last literal `cd` in an earlier segment,
// else the payload cwd. Returns { dir } or { undecidable: reason }.
export function resolveDir(inv, segmentIndex, segments, cwd, pathResolve) {
  if (inv.dir) {
    if (!inv.dir.literal) return { undecidable: 'a -C directory the hook cannot read' };
    return { dir: pathResolve(cwd, inv.dir.text) };
  }
  for (let i = segmentIndex - 1; i >= 0; i--) {
    const words = segments[i];
    if (words[0]?.text !== 'cd') continue;
    const operand = words[1];
    if (!operand || !operand.literal || operand.text === '-') return { undecidable: 'a cd the hook cannot follow' };
    return { dir: pathResolve(cwd, operand.text) };
  }
  return { dir: cwd };
}

// ---------------------------------------------------------------------------------------
// Git reads, opt-out, verdict
// ---------------------------------------------------------------------------------------

export function runGit(args, cwd) {
  if (!cwd || !existsSync(cwd)) return { ok: false, out: '', timedOut: false, missing: true };
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: GIT_TIMEOUT_MS, windowsHide: true });
  const timedOut = r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM';
  return { ok: !timedOut && r.status === 0, out: (r.stdout ?? '').trim(), timedOut };
}

// Grammar: comment and blank lines; exactly one `disabled:` line; then `  - <name>` lines
// naming a hook. Anything else is malformed (null).
export function parseOptOut(text) {
  const disabled = new Set();
  let header = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    if (!header) {
      if (line === 'disabled:') { header = true; continue; }
      return null;
    }
    const m = /^\s+-\s+([a-z-]+)$/.exec(line);
    if (!m || !HOOK_NAMES.includes(m[1])) return null;
    disabled.add(m[1]);
  }
  return header ? disabled : null;
}

// The committed opt-out of the repository holding `dir`: status absent | ok | malformed | failed.
export function readOptOut(dir) {
  const ls = runGit(['ls-tree', '--name-only', 'HEAD', '--', OPT_OUT_FILE], dir);
  if (!ls.ok) return { status: 'failed', disabled: new Set() };
  if (ls.out === '') return { status: 'absent', disabled: new Set() };
  const show = runGit(['show', `HEAD:${OPT_OUT_FILE}`], dir);
  if (!show.ok) return { status: 'failed', disabled: new Set() };
  const disabled = parseOptOut(show.out);
  return disabled ? { status: 'ok', disabled } : { status: 'malformed', disabled: new Set() };
}

function conclude(hookName, verdict) {
  const { blocks, notices, dir } = verdict;
  if (blocks.length === 0 && notices.length === 0) process.exit(EXIT_ALLOW);
  const optOut = readOptOut(dir || process.cwd());
  if (optOut.status === 'ok' && optOut.disabled.has(hookName)) process.exit(EXIT_ALLOW);
  if (optOut.status === 'failed' || optOut.status === 'malformed') {
    notices.push(`agentsmith hook ${hookName}: ${OPT_OUT_FILE} could not be read or is malformed at HEAD, so every hook stays on.`);
  }
  if (blocks.length) {
    process.stderr.write(`${blocks[0]}\n${notices.map((n) => `${n}\n`).join('')}`);
    process.exit(EXIT_BLOCK);
  }
  process.stderr.write(`${notices[0]}\n`);
  process.exit(EXIT_NOTICE);
}

// Run a hook: read the payload, let `decide` fill the verdict, conclude. An exception takes
// the notice path after any block already found.
export async function runHook(hookName, decide) {
  const verdict = { blocks: [], notices: [], dir: null };
  try {
    const payload = parsePayload(await readStdin());
    if (payload) decide(payload, verdict);
  } catch (err) {
    verdict.notices.push(`agentsmith hook ${hookName}: internal error (${err?.message ?? err}); the command was not fully evaluated.`);
  }
  conclude(hookName, verdict);
}

export const notice = (hookName, what) => `agentsmith hook ${hookName}: could not evaluate ${what}; allowing.`;
