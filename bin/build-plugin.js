#!/usr/bin/env node
// Generate the Claude Code plugin manifests from package.json.
//
// Two committed artifacts, both pure-templated (no directory scan): plugin.json
// (skills/commands/agents are AUTO-DISCOVERED, so they are intentionally NOT
// enumerated) and the repo-root marketplace.json (a git-subdir source pointing at
// tools/claude). A drift-guard test asserts the committed files equal this output.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const REPO = 'https://github.com/viniciussegura/agentsmith.git'; // git-subdir url (A3)

const plugin = {
  name: 'agentsmith',
  version: pkg.version,
  description: pkg.description,
  // skills/commands/agents auto-discovered (A1) — intentionally not enumerated.
  hooks: {
    PreToolUse: [
      {
        matcher: 'Agent',
        hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/agentsmith/require-explicit-model.mjs"' }],
      },
    ],
  },
};

const marketplace = {
  name: 'agentsmith',
  owner: { name: 'Vinicius Segura', email: 'viniciussegura@gmail.com' },
  plugins: [
    {
      name: 'agentsmith',
      source: { source: 'git-subdir', url: REPO, path: 'tools/claude' },
      description: pkg.description,
    },
  ],
};

const pluginJson = JSON.stringify(plugin, null, 2) + '\n';
const marketJson = JSON.stringify(marketplace, null, 2) + '\n';

if (process.argv.includes('--stdout')) {
  process.stdout.write(`${pluginJson}\n---\n${marketJson}`);
} else {
  const write = (p, c) => {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, c);
    process.stderr.write(`agentsmith: wrote ${p}\n`);
  };
  write(join(root, 'tools/claude/.claude-plugin/plugin.json'), pluginJson);
  write(join(root, '.claude-plugin/marketplace.json'), marketJson);
}
