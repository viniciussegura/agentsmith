/**
 * Build the on-demand index block listed in a lean core.
 *
 * Authored at h1 + h2 so generate()'s heading demotion lands it at h2 + h3,
 * consistent with the demoted module sections around it.
 *
 * @param {{ when: string, href: string }[]} entries
 * @returns {string} Markdown for the index section (no trailing newline).
 */
export function onDemandIndex(entries) {
  return [
    '# On-demand instructions',
    '',
    '## #on-demand Load when relevant',
    '',
    'You **MUST** read the matching file in full before starting work in its area.',
    '',
    ...entries.map((e) => `- ${e.when} -> \`${e.href}\``),
  ].join('\n');
}

/**
 * Scan one markdown text for tag definitions and references. Definitions are
 * `#{1,6} #tag` heading lines; references are `#tag` tokens outside fenced code
 * and inline backtick spans (a `#tag` placeholder or `#ui-*` glob is prose).
 *
 * @param {string} text
 * @returns {{ defined: Set<string>, referenced: Set<string> }}
 */
function scanTags(text) {
  const defined = new Set();
  const referenced = new Set();
  let inFence = false;

  for (const line of String(text).split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const def = line.match(/^#{1,6}\s+#([a-z][a-z0-9-]+)\b/i);
    if (def) {
      defined.add(def[1].toLowerCase());
      continue;
    }

    const scan = line.replace(/`[^`]*`/g, '');
    for (const m of scan.matchAll(/#([a-z][a-z0-9-]+)\b/gi)) {
      referenced.add(m[1].toLowerCase());
    }
  }

  return { defined, referenced };
}

/**
 * Find #tag references that resolve to no heading definition across the union
 * of core and bundle texts. Warn-only signal.
 *
 * @param {{ coreText: string, bundleTexts?: string[] }} input
 * @returns {string[]} Sorted unique tag names with no definition.
 */
export function danglingTags({ coreText, bundleTexts = [] }) {
  const defined = new Set();
  const referenced = new Set();

  for (const text of [coreText, ...bundleTexts]) {
    const s = scanTags(text);
    for (const t of s.defined) defined.add(t);
    for (const t of s.referenced) referenced.add(t);
  }

  return [...referenced].filter((t) => !defined.has(t)).sort();
}

/**
 * Find #tag references in the core that resolve only to a bundle definition.
 * Such a reference dangles for any session that never loads that bundle, so it
 * breaks the lean split. Bundle-to-core references are safe and not reported.
 *
 * @param {{ coreText: string, bundleTexts?: string[] }} input
 * @returns {string[]} Sorted unique core-referenced tags defined only in a bundle.
 */
export function coreToBundleRefs({ coreText, bundleTexts = [] }) {
  const core = scanTags(coreText);
  const bundleDefined = new Set();
  for (const text of bundleTexts) {
    for (const t of scanTags(text).defined) bundleDefined.add(t);
  }

  return [...core.referenced]
    .filter((t) => bundleDefined.has(t) && !core.defined.has(t))
    .sort();
}

/**
 * Parse the tag-keyed ownership map (`instructions/ownership.yaml`). Rows are kept
 * in file order WITH duplicates preserved, so a duplicate key (double-ownership) is
 * detectable -- a deduping YAML parser would hide it. Minimal on purpose: the map is a
 * flat `bare-tag: owner` mapping under an `owners:` key, so no YAML dependency is needed.
 *
 * @param {string} text
 * @returns {{ tag: string, owner: string }[]}
 */
export function parseOwnership(text) {
  const rows = [];
  let section = null;
  for (const line of String(text).split('\n')) {
    if (/^[a-z]/i.test(line)) {
      section = line.split(':')[0].trim();
      continue;
    }
    if (section !== 'owners') continue;
    const m = line.match(/^\s+([a-z][a-z0-9-]*):\s*([a-z][a-z0-9-]*)\s*$/i);
    if (m) rows.push({ tag: m[1].toLowerCase(), owner: m[2] });
  }
  return rows;
}

/**
 * Parse role-registry metadata (`instructions/roles.yaml`): the declared role ids and the
 * non-review owner markers. Owned-tag sets are NOT read here -- they derive from ownership.yaml.
 *
 * @param {string} text
 * @returns {{ roles: string[], markers: string[] }}
 */
export function parseRoles(text) {
  const roles = [];
  const markers = [];
  let section = null;
  for (const line of String(text).split('\n')) {
    if (/^[a-z]/i.test(line)) {
      section = line.split(':')[0].trim();
      continue;
    }
    if (section === 'roles') {
      const m = line.match(/^\s+([a-z][a-z0-9-]*):/i);
      if (m) roles.push(m[1].toLowerCase());
    } else if (section === 'markers') {
      const m = line.match(/^\s*-\s*([a-z][a-z0-9-]*)/i);
      if (m) markers.push(m[1].toLowerCase());
    }
  }
  return { roles, markers };
}

/**
 * Coverage lint for the role->rule ownership map. Asserts every instruction #tag has
 * exactly one resolvable owner. Hard failures (CI gate): orphans (a defined tag with no
 * owner row), doubleOwned (a tag with more than one row), and unresolvedOwners (an owner
 * that is neither a declared role nor a known marker). Warnings: stale (an owner row whose
 * tag is defined nowhere) and rolesWithoutTags (a non-`correctness` role owning no tag).
 *
 * @param {{ instructionTexts: string[], ownershipText: string, rolesText: string }} input
 * @returns {{ orphans: string[], doubleOwned: string[], unresolvedOwners: {tag:string,owner:string}[], stale: string[], rolesWithoutTags: string[] }}
 */
export function ownershipCoverage({ instructionTexts, ownershipText, rolesText }) {
  const defined = new Set();
  for (const text of instructionTexts) {
    for (const tag of scanTags(text).defined) defined.add(tag);
  }

  const rows = parseOwnership(ownershipText);
  const { roles, markers } = parseRoles(rolesText);
  const validOwners = new Set([...roles, ...markers]);

  const seen = new Set();
  const doubleOwned = [];
  for (const { tag } of rows) {
    if (seen.has(tag)) doubleOwned.push(tag);
    seen.add(tag);
  }

  const orphans = [...defined].filter((t) => !seen.has(t)).sort();
  const unresolvedOwners = rows
    .filter((r) => !validOwners.has(r.owner))
    .map((r) => ({ tag: r.tag, owner: r.owner }));
  const stale = rows.filter((r) => !defined.has(r.tag)).map((r) => r.tag).sort();

  const owningRoles = new Set(rows.map((r) => r.owner));
  const rolesWithoutTags = roles
    .filter((r) => r !== 'correctness' && !owningRoles.has(r))
    .sort();

  return {
    orphans,
    doubleOwned: [...new Set(doubleOwned)].sort(),
    unresolvedOwners,
    stale,
    rolesWithoutTags,
  };
}

/** Tag filenames must be lowercase-leading (so filename-sort == tag-sort). _intro.md is exempt. */
export function tagFilenameLint(paths) {
  return paths
    .map((p) => ({ p, base: p.split('/').pop() }))
    .filter(({ base }) => base !== '_intro.md' && !/^[a-z]/.test(base))
    .map(({ p }) => p);
}
