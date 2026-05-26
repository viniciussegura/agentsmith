import { posix as ppath } from 'node:path';
import { generate } from './generate.js';
import { onDemandIndex, danglingTags } from './bundles.js';

const BUNDLE_DIR = '.agentsmith/agents';

const STUB = [
  '<!-- Consumer-owned. agentsmith generates .agentsmith/AGENTS.md; reference or extend it here. -->',
  '',
  'See `.agentsmith/AGENTS.md` for generated agent instructions.',
  '',
].join('\n');

/**
 * Assemble every output file as in-memory strings. Pure: no disk access.
 *
 * @param {object}   opts
 * @param {string}   opts.preamble
 * @param {string[]} opts.modules                 Core module CONTENTS (already read).
 * @param {{name,title,when,modules:string[]}[]} [opts.bundles]  Bundle defs; modules are CONTENTS.
 * @param {string}   opts.source
 * @param {string}   [opts.commit]
 * @param {string}   [opts.date]
 * @param {'lean'|'full'} [opts.layout='lean']
 * @param {'nested'|'root'} [opts.placement='nested']
 * @param {string}   [opts.output='AGENTS.md']    Core filename when placement is root.
 * @param {string}   [opts.out]                   Explicit core path override.
 * @returns {{ corePath, coreContent, bundles: {path,content}[], stub: {path,content}|null, dangling: string[] }}
 */
export function buildOutputs({
  preamble,
  modules = [],
  bundles = [],
  source,
  commit,
  date,
  layout = 'lean',
  placement = 'nested',
  output = 'AGENTS.md',
  out,
}) {
  const corePath = out || (placement === 'nested' ? '.agentsmith/AGENTS.md' : output);
  const coreDir = ppath.dirname(corePath.split(/[\\/]/).join('/')) || '.';
  const hrefFor = (name) => ppath.relative(coreDir, `${BUNDLE_DIR}/${name}.md`);

  let coreContent;
  let bundleFiles = [];

  if (layout === 'full') {
    const allModules = [...modules, ...bundles.flatMap((b) => b.modules)];
    coreContent = generate({ preamble, modules: allModules, source, commit, date });
  } else {
    const index = onDemandIndex(
      bundles.map((b) => ({ when: b.when, href: hrefFor(b.name) })),
    );
    coreContent = generate({ preamble, modules: [...modules, index], source, commit, date });
    bundleFiles = bundles.map((b) => ({
      path: `${BUNDLE_DIR}/${b.name}.md`,
      content: generate({
        preamble: `# ${b.title || b.name}`,
        modules: b.modules,
        source,
        commit,
        date,
      }),
    }));
  }

  const dangling = danglingTags({
    coreText: coreContent,
    bundleTexts: bundleFiles.map((f) => f.content),
  });

  const stub = placement === 'nested' && !out ? { path: 'AGENTS.md', content: STUB } : null;

  return { corePath, coreContent, bundles: bundleFiles, stub, dangling };
}
