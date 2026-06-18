/**
 * One-time pre-step for the one-file-per-tag split: within each multi-rule
 * instruction file, sort the `## #tag` sections alphabetically by tag and
 * normalize whitespace (head + sections separated by exactly one blank line,
 * no section-trailing blanks), so the alphabetical resolver reproduces the
 * sources post-split and the split is a strict empty-diff migration.
 *
 * Content-preserving: only section order and inter-section whitespace change.
 * Usage: node devtools/restructure/reorder.mjs <file.md> [<file.md> ...]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const isHeading = (l) => /^## #/.test(l);
const tagOf = (l) => l.match(/^## #(\S+)/)[1];

for (const file of process.argv.slice(2)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const first = lines.findIndex(isHeading);
  if (first === -1) continue; // no rule sections; leave as-is

  const head = lines.slice(0, first).join('\n').replace(/\n+$/, ''); // h1 + intro prose, trailing-trimmed
  const sections = [];
  let cur = null;
  for (const l of lines.slice(first)) {
    if (isHeading(l)) { cur = { tag: tagOf(l), body: [l] }; sections.push(cur); }
    else cur.body.push(l);
  }
  const ordered = sections
    .map((s) => ({ tag: s.tag, text: s.body.join('\n').replace(/\n+$/, '') }))
    .sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
    .map((s) => s.text);

  const body = ordered.join('\n\n');
  const out = (head ? head + '\n\n' : '') + body + '\n';
  writeFileSync(file, out);
}
console.log(`reordered+normalized ${process.argv.slice(2).length} files`);
