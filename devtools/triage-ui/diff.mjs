/**
 * Minimal line-level diff (LCS) for the triage UI's current→draft before/after.
 * Pure, zero-dependency. Returns ordered rows for red/green rendering.
 *
 *   lineDiff(current, draft) -> Array<{ type: 'same'|'del'|'add', text: string }>
 *
 * 'del' = a line in current but not draft; 'add' = a line in draft but not
 * current; 'same' = a shared line. Order is the natural reading order of the
 * draft with deletions shown at their original position.
 */

export function lineDiff(current, draft) {
  const a = current == null || current === '' ? [] : String(current).split('\n');
  const b = draft == null || draft === '' ? [] : String(draft).split('\n');

  // LCS length table over lines.
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  // Backtrack into ordered diff rows.
  const rows = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ type: 'same', text: a[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: 'del', text: a[i] });
      i++;
    } else {
      rows.push({ type: 'add', text: b[j] });
      j++;
    }
  }
  while (i < n) rows.push({ type: 'del', text: a[i++] });
  while (j < m) rows.push({ type: 'add', text: b[j++] });
  return rows;
}
