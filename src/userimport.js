const MARKER = '<!-- agentsmith: generated user instructions -->';

const norm = (p) => p.replace(/\\/g, '/');
const isAbsolute = (p) => /^([a-zA-Z]:[\\/]|\/)/.test(p);

/**
 * Plan the user-global CLAUDE.md import wiring. Pure: no disk access.
 *
 * Appends a marked import block pointing at the generated home instructions,
 * unless an import of that file is already present (idempotent). Never rewrites
 * existing content.
 *
 * @param {string|null} existingContent  Current ~/.claude/CLAUDE.md content, or null if absent.
 * @param {string} targetPath  Absolute path to ~/.agentsmith/AGENTS.md (any slash form).
 * @returns {string|null}  New file content to write, or null when the import already exists.
 */
export function userImport(existingContent, targetPath) {
  const target = norm(targetPath);
  const importLine = `@${target}`;
  const block = `${MARKER}\n${importLine}\n`;

  if (existingContent == null) return block;

  const present = existingContent.split('\n').some((line) => {
    const t = line.trim();
    if (t === importLine) return true;
    if (!t.startsWith('@')) return false;
    const rest = t.slice(1).trim();
    return isAbsolute(rest) && norm(rest) === target;
  });
  if (present) return null;

  const sep = existingContent.endsWith('\n') ? '\n' : '\n\n';
  return existingContent + sep + block;
}
