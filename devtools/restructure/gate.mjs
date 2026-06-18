/**
 * Strict empty-diff gate for the one-file-per-tag split. Compares the current
 * generator output (--stdout core, --full, every bundle file) against the
 * captured prepared-tree reference (.agentsmith/tmp/restructure/ref1). Exits
 * non-zero on any difference.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const REF = '.agentsmith/tmp/restructure/ref1';
// The generated header's "Source revision <commit> (<date>)" line is volatile by
// design (it stamps HEAD + the build date), not instruction content. Strip it so
// the gate proves the *content* is byte-identical regardless of when ref vs now.
const strip = (s) => s.split('\n').filter((l) => !/^\s*Source revision /.test(l)).join('\n');
const run = (args) => strip(execFileSync('node', ['bin/cli.js', ...args], { encoding: 'utf8' }));
const read = (p) => strip(readFileSync(p, 'utf8'));

const checks = [
  ['core (--stdout)', run(['--stdout']), read(join(REF, 'core.md'))],
  ['full (--full --stdout)', run(['--full', '--stdout']), read(join(REF, 'full.md'))],
];
run([]); // regenerate lean bundles into .agentsmith/agents
for (const f of readdirSync(join(REF, 'bundles'))) {
  checks.push([`bundle ${f}`, read(join('.agentsmith/agents', f)), read(join(REF, 'bundles', f))]);
}

let ok = true;
for (const [name, post, pre] of checks) {
  if (post === pre) { console.log(`OK   ${name}`); continue; }
  ok = false;
  console.error(`DIFF ${name}`);
  const a = pre.split('\n'), b = post.split('\n');
  let shown = 0;
  for (let i = 0; i < Math.max(a.length, b.length) && shown < 8; i++) {
    if (a[i] !== b[i]) {
      console.error(`  line ${i + 1}:\n    ref:  ${JSON.stringify(a[i])}\n    new:  ${JSON.stringify(b[i])}`);
      shown++;
    }
  }
}
console.log(ok ? 'GATE PASS: empty diff' : 'GATE FAIL');
process.exit(ok ? 0 : 1);
