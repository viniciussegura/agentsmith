import { execFileSync } from 'node:child_process';

const realGit = (pkgRoot) => (args) =>
  execFileSync('git', args, { cwd: pkgRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();

/**
 * Resolve the source-revision stamp for the generated header. Prefers git
 * (short SHA + commit date, `-dirty` when the tree is dirty); when git is
 * unavailable (npx install, no repo) falls back to the package version so the
 * artifact is never unversioned. Pure given an injected runGit.
 *
 * @param {{pkgRoot:string, pkgVersion:string, runGit?:(args:string[])=>string}} opts
 * @returns {{commit?:string, date?:string}}
 */
export function sourceRevision({ pkgRoot, pkgVersion, runGit }) {
  const git = runGit || realGit(pkgRoot);
  try {
    const commit = git(['rev-parse', '--short', 'HEAD']);
    const date = git(['log', '-1', '--format=%cd', '--date=short']);
    const dirty = git(['status', '--porcelain']) !== '';
    return { commit: dirty ? `${commit}-dirty` : commit, date };
  } catch {
    return { commit: pkgVersion };
  }
}
