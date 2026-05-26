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
 * Find #tag references that resolve to no heading definition across the union
 * of core and bundle texts. Definitions are `#{1,6} #tag` heading lines;
 * references are `#tag` tokens outside fenced code. Warn-only signal.
 *
 * @param {{ coreText: string, bundleTexts?: string[] }} input
 * @returns {string[]} Sorted unique tag names with no definition.
 */
export function danglingTags({ coreText, bundleTexts = [] }) {
  const defined = new Set();
  const referenced = new Set();

  for (const text of [coreText, ...bundleTexts]) {
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

      for (const m of line.matchAll(/#([a-z][a-z0-9-]+)\b/gi)) {
        referenced.add(m[1].toLowerCase());
      }
    }
  }

  return [...referenced].filter((t) => !defined.has(t)).sort();
}
