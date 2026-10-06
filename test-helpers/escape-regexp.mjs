// Escape a literal string for use inside a RegExp source.
export const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
