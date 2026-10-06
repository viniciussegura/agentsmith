#!/usr/bin/env node
// agentsmith PreToolUse hook (#swe-dated-todos): an added in-code deferral marker without a
// date is blocked. Matched on Write, Edit, and MultiEdit. Exit codes, opt-out, and
// non-coverage are in _lib.mjs.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { runHook } from './_lib.mjs';

const HOOK = 'guard-dated-todos';
const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
// The rule governs in-code markers; prose names the bare words when it talks about them.
const PROSE_EXTENSIONS = new Set(['.md', '.mdx', '.txt']);
// Assembled from parts so the installed guard never trips on this file.
const MARKER_WORDS = [['TO', 'DO'], ['FIX', 'ME'], ['HA', 'CK'], ['XX', 'X'], ['B', 'UG']].map((p) => p.join(''));
// A marker is dated when `(` and a YYYY-MM-DD date immediately follow the word.
const UNDATED_MARKER = new RegExp(`\\b(${MARKER_WORDS.join('|')})\\b(?!\\(\\d{4}-\\d{2}-\\d{2})`);

const lines = (text) => String(text ?? '').split(/\r?\n/);

// Lines present in `next` and absent from `prior`: what an edit adds.
function addedLines(next, prior) {
  const before = new Set(lines(prior));
  return lines(next).filter((l) => !before.has(l));
}

function addedByTool(payload, file) {
  const input = payload.tool_input ?? {};
  if (payload.tool_name === 'Write') {
    const prior = existsSync(file) ? readFileSync(file, 'utf8') : '';
    return addedLines(input.content, prior);
  }
  if (payload.tool_name === 'Edit') return addedLines(input.new_string, input.old_string);
  const edits = Array.isArray(input.edits) ? input.edits : [];
  return edits.flatMap((e) => addedLines(e?.new_string, e?.old_string));
}

runHook(HOOK, (payload, verdict) => {
  if (!EDIT_TOOLS.has(payload.tool_name)) return;
  const filePath = payload.tool_input?.file_path;
  if (typeof filePath !== 'string' || filePath === '') return;
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
  const file = resolve(cwd, filePath);
  verdict.dir = dirname(file);
  if (PROSE_EXTENSIONS.has(extname(file).toLowerCase())) return;
  for (const line of addedByTool(payload, file)) {
    const m = UNDATED_MARKER.exec(line);
    if (!m) continue;
    verdict.blocks.push(
      `Blocked by #swe-dated-todos: a deferral marker (${m[1]}) carries the date it was written, ${MARKER_WORDS[0]}(YYYY-MM-DD). ` +
        'Add the date, or record the work as a future-work or technical-debt note.',
    );
    return;
  }
});
