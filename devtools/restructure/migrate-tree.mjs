/**
 * One-time: split each (already reordered+normalized) multi-rule file into
 * <section>/<group>/{_intro.md,<tag>.md}. _intro.md = the file's content above
 * the first `## #tag` (h1 + prose), verbatim. Each section -> <tag>.md with its
 * heading promoted `## #` -> `# #`. Removes the old multi-rule file.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// [sourceFile, groupDir]. Branch sections (core, frontend) get per-group subdirs;
// leaf sections (backend, authoring) keep their own section dir as the group.
const MAP = [
  ['instructions/core/ai.md', 'instructions/core/ai'],
  ['instructions/core/code.md', 'instructions/core/code'],
  ['instructions/core/git.md', 'instructions/core/git'],
  ['instructions/core/swe.md', 'instructions/core/swe'],
  ['instructions/frontend/front.md', 'instructions/frontend/front'],
  ['instructions/frontend/ui-guidelines.md', 'instructions/frontend/ui-guidelines'],
  ['instructions/backend/backend.md', 'instructions/backend'],
  ['instructions/authoring/instruction-review.md', 'instructions/authoring'],
];

const isHeading = (l) => /^## #/.test(l);
const tagOf = (l) => l.match(/^## #(\S+)/)[1];

for (const [src, groupDir] of MAP) {
  const lines = readFileSync(src, 'utf8').split('\n');
  const first = lines.findIndex(isHeading);
  if (first === -1) throw new Error(`no rule sections in ${src}`);
  const head = lines.slice(0, first).join('\n').replace(/\n+$/, '');
  mkdirSync(groupDir, { recursive: true });
  writeFileSync(join(groupDir, '_intro.md'), (head ? head : '') + '\n');

  let cur = null;
  const flush = () => {
    if (!cur) return;
    const body = cur.body.join('\n').replace(/\n+$/, '');
    writeFileSync(join(groupDir, `${cur.tag}.md`), body.replace(/^## #/, '# #') + '\n');
  };
  for (const l of lines.slice(first)) {
    if (isHeading(l)) { flush(); cur = { tag: tagOf(l), body: [l] }; }
    else cur.body.push(l);
  }
  flush();
  rmSync(src);
}
console.log(`split ${MAP.length} files into the tree`);
