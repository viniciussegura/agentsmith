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

/**
 * Remove agentsmith's marked import block (the MARKER line + its following
 * import line) from ~/.claude/CLAUDE.md content. Inverse of userImport. Pure.
 *
 * @param {string|null} existingContent  Current file content, or null if absent.
 * @param {string} targetPath  Absolute path to ~/.agentsmith/AGENTS.md (any slash form).
 * @returns {string|null}  New content with the block removed, or null when nothing matched.
 */
export function userUnimport(existingContent, targetPath) {
  if (existingContent == null) return null;
  const target = norm(targetPath);
  const importLine = `@${target}`;
  const isOurImport = (t) => {
    if (t === importLine) return true;
    if (!t.startsWith('@')) return false;
    const rest = t.slice(1).trim();
    return isAbsolute(rest) && norm(rest) === target;
  };

  const lines = existingContent.split('\n');
  const kept = [];
  let removed = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === MARKER) {
      // Drop the marker and an immediately-following (optionally blank-separated) import line.
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j < lines.length && isOurImport(lines[j].trim())) {
        removed = true;
        i = j; // skip through the import line
        continue;
      }
    }
    kept.push(lines[i]);
  }
  if (!removed) return null;
  // Collapse a trailing run of blank lines the removal may have left, keeping one final newline.
  let out = kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/,'\n');
  if (out === '\n') out = '';
  return out;
}
