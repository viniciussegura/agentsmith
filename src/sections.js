/**
 * Split an ordered list of manifest sections into the always-loaded core and
 * the on-demand bundles. Pure: the module lister is injected, so this is
 * testable without disk access. File I/O (reading the resolved paths) stays in
 * bin/cli.js.
 *
 * A section with no `when` is inlined into the core, in section order; a
 * section with a `when` becomes a bundle. A section's `modules` list, when
 * present, overrides the `listModules(name)` result; demote is derived from
 * the basename (_intro.md -> 1, everything else -> 2).
 *
 * @param {object} opts
 * @param {{ name: string, when?: string, title?: string, modules?: string[] }[]} opts.sections
 * @param {(name: string) => { path: string, demote: number }[]} opts.listModules
 *   Resolved, ordered descriptors for a section folder.
 * @returns {{ coreModules: { path: string, demote: number }[], bundles: { name: string, title?: string, when: string, modules: { path: string, demote: number }[] }[] }}
 */

/** Role-based demote level from a file's basename: an _intro.md is a group
 * heading (demote 1), every other file is a rule (demote 2). Single source of
 * truth, shared with the recursive lister in bin/cli.js. */
export const demoteForBasename = (base) => (base === '_intro.md' ? 1 : 2);

const demoteForPath = (p) => demoteForBasename(p.split('/').pop());

export function resolveSections({ sections = [], listModules }) {
  const coreModules = [];
  const bundles = [];

  for (const section of sections) {
    const mods = section.modules
      ? section.modules.map((path) => ({ path, demote: demoteForPath(path) }))
      : listModules(section.name);
    if (section.when == null) {
      coreModules.push(...mods);
    } else {
      bundles.push({ name: section.name, title: section.title, when: section.when, modules: mods });
    }
  }

  return { coreModules, bundles };
}
