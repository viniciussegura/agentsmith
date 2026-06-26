// Install manifest: records the files agentsmith generated this run so the next
// run can prune orphans (paths a prior run wrote that the current sources no
// longer produce) WITHOUT ever deleting a path agentsmith did not record writing
// (#ai-tool-safety). Lives at .agentsmith/.install-manifest.json (gitignored).
import {
  readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, readdirSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

export const MANIFEST_REL = '.agentsmith/.install-manifest.json';

export function manifestPath(base) {
  return resolve(base, MANIFEST_REL);
}

// Missing or malformed -> empty path set (a first run, or a user who deleted the
// manifest, simply prunes nothing this cycle; never an error).
export function readManifest(base) {
  const p = manifestPath(base);
  if (!existsSync(p)) return { version: 1, paths: [] };
  try {
    const m = JSON.parse(readFileSync(p, 'utf8'));
    return { version: m.version ?? 1, paths: Array.isArray(m.paths) ? m.paths.filter((e) => typeof e === 'string') : [] };
  } catch {
    return { version: 1, paths: [] };
  }
}

// Pure: orphans to prune = recorded-previous minus current (order-stable on prev).
export function orphanPaths(prevPaths, currentPaths) {
  const cur = new Set(currentPaths);
  return prevPaths.filter((p) => !cur.has(p));
}

// Delete each orphan that still exists under base, then remove parent dirs the
// deletion left empty, climbing toward (never removing) base. Returns the rel
// paths actually deleted. Bounded to `orphans` — never touches an unlisted path.
export function pruneOrphans(base, orphans) {
  const root = resolve(base);
  const deleted = [];
  for (const rel of orphans) {
    const abs = resolve(base, rel);
    if (!existsSync(abs)) continue;
    rmSync(abs, { force: true });
    deleted.push(rel);
    let dir = dirname(abs);
    while (dir !== root && dir.startsWith(root)) {
      try {
        if (readdirSync(dir).length > 0) break;
        rmSync(dir, { recursive: true });
        dir = dirname(dir);
      } catch {
        break;
      }
    }
  }
  return deleted;
}

// Write the new manifest (sorted, deduped). generatedAt is injected by the caller
// so tests stay deterministic.
export function writeManifest(base, paths, generatedAt) {
  const p = manifestPath(base);
  mkdirSync(dirname(p), { recursive: true });
  const sorted = [...new Set(paths)].sort();
  writeFileSync(p, `${JSON.stringify({ version: 1, generatedAt, paths: sorted }, null, 2)}\n`);
  return p;
}
