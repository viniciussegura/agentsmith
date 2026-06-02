/**
 * Map committed tool-adapter sources to their runtime install destinations.
 * A file at `tools/<ai>/<rest>` installs to `.<ai>/<rest>` in the consumer
 * project (e.g. `tools/claude/skills/spec-review/SKILL.md` ->
 * `.claude/skills/spec-review/SKILL.md`), so each tool's runtime discovers it.
 * Pure: no disk access.
 *
 * @param {string[]} sourceRelPaths  Paths relative to the package root.
 * @returns {{src: string, dest: string}[]}  Only paths inside a `tools/<ai>/` dir.
 */
export function planToolInstall(sourceRelPaths) {
  const plan = [];
  for (const raw of sourceRelPaths) {
    const rel = raw.split(/[\\/]/).join('/');
    const m = rel.match(/^tools\/([^/]+)\/(.+)$/);
    if (!m) continue;
    const [, ai, rest] = m;
    plan.push({ src: rel, dest: `.${ai}/${rest}` });
  }
  return plan;
}
