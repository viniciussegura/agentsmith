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
