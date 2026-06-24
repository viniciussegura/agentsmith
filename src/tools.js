/**
 * Map committed tool-adapter sources to their runtime install destinations.
 * Two adapter roots are recognized:
 *  - `tools/<ai>/<rest>`        -> `.<ai>/<rest>`  (shippable; any ai name)
 *  - `devtools/claude/<rest>`   -> `.claude/<rest>` (authoring-only; `claude` ONLY)
 * Under `devtools/` any second segment other than `claude` (e.g. `triage-ui`,
 * `restructure`) is dropped, so dev-only runtime scripts are never installed as
 * adapters. Pure: no disk access.
 *
 * @param {string[]} sourceRelPaths  Paths relative to the package root.
 * @returns {{src: string, dest: string}[]}  Only paths inside a recognized root.
 */
export function planToolInstall(sourceRelPaths) {
  const plan = [];
  for (const raw of sourceRelPaths) {
    const rel = raw.split(/[\\/]/).join('/');
    const m = rel.match(/^(?:tools\/([^/]+)|devtools\/(claude))\/(.+)$/);
    if (!m) continue;
    const ai = m[1] ?? m[2];
    const rest = m[3];
    plan.push({ src: rel, dest: `.${ai}/${rest}` });
  }
  return plan;
}
