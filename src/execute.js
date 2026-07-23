import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { mergeSettings, agentsmithHooks, HOOK_REL } from './settings.js';
import { userImport, userUnimport } from './userimport.js';
import { pruneOrphans } from './manifest.js';

const writeAbs = (dest, content, log) => {
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content);
  log(`agentsmith: wrote ${dest}`);
};

function editSettings(dest, owned, log) {
  let existing = null;
  if (existsSync(dest)) {
    try { existing = JSON.parse(readFileSync(dest, 'utf8')); }
    catch { log(`agentsmith: warning -- ${dest} is not valid JSON; left untouched`); return; }
  }
  const next = mergeSettings(existing, owned);
  writeAbs(dest, `${JSON.stringify(next, null, 2)}\n`, log);
}

function editImport(dest, target, remove, log) {
  const existing = existsSync(dest) ? readFileSync(dest, 'utf8') : null;
  const next = remove ? userUnimport(existing, target) : userImport(existing, target);
  if (next !== null) writeAbs(dest, next, log);
  else log(`agentsmith: ${remove ? 'no agentsmith import to remove in' : 'kept existing import in'} ${dest}`);
}

/** Apply a Plan to disk. Effectful. */
export function applyPlan(plan, { pkgRoot, log = (m) => process.stderr.write(`${m}\n`) }) {
  const { base, absolute } = plan;
  for (const op of plan.ops) {
    switch (op.kind) {
      case 'write': {
        const content = op.content !== undefined ? op.content : readFileSync(join(pkgRoot, op.src));
        writeAbs(resolve(base, op.path), content, log);
        break;
      }
      case 'prune': {
        const deleted = pruneOrphans(base, op.paths);
        if (deleted.length) log(`agentsmith: removed ${deleted.length} file(s)`);
        break;
      }
      case 'mergeSettings': {
        const commandPath = absolute ? resolve(base, HOOK_REL) : HOOK_REL;
        editSettings(resolve(base, op.path), agentsmithHooks(commandPath), log);
        break;
      }
      case 'unmergeSettings':
        editSettings(resolve(base, op.path), {}, log);
        break;
      case 'writeImport':
        editImport(resolve(base, op.path), resolve(base, op.target).replace(/\\/g, '/'), false, log);
        break;
      case 'removeImport':
        editImport(resolve(base, op.path), resolve(base, op.target).replace(/\\/g, '/'), true, log);
        break;
      case 'keepStub':
      case 'keepImport':
        log(`agentsmith: kept existing ${resolve(base, op.path)}`);
        break;
    }
  }
}
