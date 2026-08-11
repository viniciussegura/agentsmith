// The three installed skill scripts gate their CLI block on "was I invoked
// directly?". The documented way to reach them is `.claude/skills/<name>/...`,
// which on a plugin install is a SYMLINK into the plugin cache. `import.meta.url`
// is the realpath, so a guard comparing it to a merely-absolutized `argv[1]`
// never matches through a link: the whole CLI block is skipped and the process
// exits 0 having done nothing -- a persistence or convergence step that silently
// no-ops. Each script is exercised here through a linked directory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// A directory link needs no elevation on either platform: 'junction' on Windows
// (unlike a file symlink, which does), 'dir' elsewhere.
const LINK_TYPE = process.platform === 'win32' ? 'junction' : 'dir';

// Run `node <script>` and return { status, out } with stdout+stderr merged --
// the bug's signature is EMPTY output with status 0, so both streams matter.
function run(script, args) {
  try {
    const out = execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: 'pipe' });
    return { status: 0, out };
  } catch (e) {
    return { status: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

// Link `<repo>/tools/claude/skills/<skill>` into a temp dir and invoke the script
// through the link, mirroring the `.claude/skills/<skill>` plugin install.
function throughLink(skill, script, args) {
  const dir = mkdtempSync(join(tmpdir(), 'agentsmith-link-'));
  const link = join(dir, skill);
  try {
    symlinkSync(join(repo, 'tools', 'claude', 'skills', skill), link, LINK_TYPE);
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`could not create a ${LINK_TYPE} link (${e.code}) -- the entry guard cannot be verified`);
  }
  try {
    return run(join(link, script), args);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const CASES = [
  {
    name: 'code-review-board/persist.mjs',
    skill: 'code-review-board',
    script: 'persist.mjs',
    args: ['bogus-command', 'no-such-store', 'no-such-round'],
    expect: /usage: persist\.mjs/,
    status: 2,
  },
  {
    name: 'code-review-board/lint.mjs',
    skill: 'code-review-board',
    script: 'lint.mjs',
    args: [join(tmpdir(), 'agentsmith-no-such-store')],
    expect: /review-board lint: 0 error\(s\)/,
    status: 0,
  },
  {
    name: 'spec-review-board/guard.mjs',
    skill: 'spec-review-board',
    script: 'guard.mjs',
    args: [],
    expect: /usage: node guard\.mjs/,
    status: 2,
  },
];

for (const c of CASES) {
  test(`${c.name} runs its CLI block when invoked through a linked skill dir`, () => {
    const direct = run(join(repo, 'tools', 'claude', 'skills', c.skill, c.script), c.args);
    assert.match(direct.out, c.expect, 'baseline: the real path reaches the CLI block');

    const linked = throughLink(c.skill, c.script, c.args);
    assert.match(linked.out, c.expect, 'a linked invocation reaches the same CLI block');
    assert.equal(linked.status, c.status, 'and exits with the same status as the direct call');
  });
}

test('every skill CLI entry guard resolves argv[1] through realpath', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const skillsRoot = join(repo, 'tools', 'claude', 'skills');
  const offenders = [];
  for (const skill of readdirSync(skillsRoot)) {
    const dir = join(skillsRoot, skill);
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.mjs')) continue;
      const src = readFileSync(join(dir, f), 'utf8');
      if (!src.includes('invokedDirectly')) continue;
      // Either route is correct: the shared `isMain` helper, or an inline
      // realpathSync. `resolve(argv[1])` ALONE is the defect -- it absolutizes
      // without following links.
      if (!src.includes('realpathSync') && !src.includes('isMain')) offenders.push(`${skill}/${f}`);
    }
  }
  assert.deepEqual(offenders, [], 'a CLI entry guard without realpath resolution silently no-ops through a link');
});
