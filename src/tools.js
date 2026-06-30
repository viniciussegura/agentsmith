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
    const rest = namespaceRest(ai, m[3]);
    plan.push({ src: rel, dest: `.${ai}/${rest}` });
  }
  return plan;
}

// Project-level Claude commands install as BARE slash names, which can collide
// with a built-in or another plugin (a generic `/review-board`, say). Prefix
// each with `agentsmith-` so the npx-installed command surface is
// `/agentsmith-<name>` -- deliberately the hyphen form, kept distinct from the
// plugin's colon form (`/agentsmith:<name>`, set by plugin.json) so a project
// that installs BOTH gets two non-colliding names rather than one ambiguous
// `/agentsmith:<name>`. A name already starting with `agentsmith` is left alone,
// so `agentsmith-init` does not become `agentsmith-agentsmith-init`.
//
// SKILLS are intentionally NOT prefixed: a skill dir holds internal scripts
// (board-round.mjs, guard.mjs, ...) referenced by `.claude/skills/<dir>/...` paths,
// so renaming the dir would break those refs. Skills keep their canonical names
// for the npx install and rely on the plugin's colon namespace for collision
// safety. Agents and hooks likewise stay bare (internal, dispatched by name).
function namespaceRest(ai, rest) {
  if (ai !== 'claude') return rest;
  const cmd = rest.match(/^commands\/(.+)$/);
  if (!cmd) return rest;
  const base = cmd[1];
  return `commands/${base.startsWith('agentsmith') ? base : `agentsmith-${base}`}`;
}
