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
