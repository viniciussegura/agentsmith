/**
 * Split an ordered list of manifest sections into the always-loaded core and
 * the on-demand bundles. Pure: the directory lister is injected, so this is
 * testable without disk access. File I/O (reading the resolved paths) stays in
 * bin/cli.js.
 *
 * A section with no `when` is inlined into the core, in section order; a
 * section with a `when` becomes a bundle. A section's `modules` list, when
 * present, overrides the globbed `listFiles(name)` result verbatim.
 *
 * @param {object} opts
 * @param {{ name: string, when?: string, title?: string, modules?: string[] }[]} opts.sections
 * @param {(name: string) => string[]} opts.listFiles  Resolved, ordered paths for a section folder.
 * @returns {{ coreModulePaths: string[], bundles: { name, title, when, modulePaths: string[] }[] }}
 */
export function resolveSections({ sections = [], listFiles }) {
  const coreModulePaths = [];
  const bundles = [];

  for (const section of sections) {
    const paths = section.modules ?? listFiles(section.name);
    if (section.when == null) {
      coreModulePaths.push(...paths);
    } else {
      bundles.push({
        name: section.name,
        title: section.title,
        when: section.when,
        modulePaths: paths,
      });
    }
  }

  return { coreModulePaths, bundles };
}
