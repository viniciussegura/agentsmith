import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorksheet } from '../devtools/triage-ui/migrate.mjs';
import { validateFile, migrateWorksheet } from '../devtools/triage-ui/schema.mjs';

const MD = `# Instruction-review triage worksheet

Converted from round 2026-06-16 (32 verified).

---

### swe-errors   strengthen · swe · core/swe.md
- kind: strengthen
- role: swe
- targetFile: instructions/core/swe.md
- status: ready
- gap: "context added" undefined

current:
\`\`\`\`
## #swe-errors Error handling
old body
\`\`\`\`

draft:
\`\`\`\`
## #swe-errors Error handling
new body
\`\`\`\`

decision:
- [ ] adopt
- [ ] reject
- [ ] fold
- [ ] defer
- [ ] refine

decisionText:

### swe-async   new-rule · swe · core/swe/swe-async.md
- kind: new-rule
- role: swe
- targetFile: instructions/core/swe/swe-async.md
- status: ready
- gap: no async rule

draft:
\`\`\`\`
## #swe-async Async
body
\`\`\`\`

decision:
- [ ] adopt
- [ ] reject
- [ ] fold
- [ ] defer
- [ ] refine

decisionText:
`;

test('parseWorksheet maps strengthen + new-rule to the schema', () => {
  const file = parseWorksheet(MD);
  assert.equal(file.round, '2026-06-16');
  assert.equal(file.entries.length, 2);

  assert.deepEqual(file.entries[0], {
    tag: 'swe-errors',
    kind: 'strengthen',
    role: 'swe',
    targetFile: 'instructions/core/swe.md',
    status: { state: 'ready' },
    gap: '"context added" undefined',
    decision: { verdict: 'park' },
    applyLog: [],
    current: '## #swe-errors Error handling\nold body',
    draft: '## #swe-errors Error handling\nnew body',
  });

  const nr = file.entries[1];
  assert.equal(nr.kind, 'new-rule');
  assert.equal(nr.current, undefined); // new-rule has no current
  assert.equal(nr.draft, '## #swe-async Async\nbody');
  assert.deepEqual(nr.decision, { verdict: 'park' });
});

test('migration output validates against the schema', () => {
  const file = parseWorksheet(MD);
  assert.deepEqual(validateFile(file), []);
});

test('a ticked decision during migration fails loudly', () => {
  const ticked = MD.replace('- [ ] adopt', '- [x] adopt');
  assert.throws(() => parseWorksheet(ticked), /unexpected ticked decision/);
});

// Regression: a current:/draft: body that itself contains a 3-backtick code
// block must not be truncated at the nested fence. The outer field uses a
// 4-backtick fence; closing must respect the OPENING fence length, so a nested
// 3-backtick fence is body content, not the terminator (cf. be-api-first).
const NESTED_MD = `# worksheet

round 2026-06-16

---

### be-api-first   strengthen · db · backend/backend.md
- kind: strengthen
- role: db
- targetFile: instructions/backend/backend.md
- status: ready
- gap: nested code fence must survive

current:
\`\`\`\`
## #be-api-first API first

Old body.

\`\`\`typescript
interface User { id: string; }
\`\`\`

Trailing table after the code block.
\`\`\`\`

draft:
\`\`\`\`
## #be-api-first API first

New body.

\`\`\`typescript
interface User { id: string; name: string; }
\`\`\`

Trailing line after the code block.
\`\`\`\`

decision:
- [ ] adopt
- [ ] reject
- [ ] fold
- [ ] defer
- [ ] refine

decisionText:
`;

test('a nested code fence inside current/draft is not truncated', () => {
  const file = parseWorksheet(NESTED_MD);
  assert.equal(file.entries.length, 1);
  const e = file.entries[0];
  // the nested ```typescript block survives intact, INCLUDING its closing fence
  assert.match(e.current, /```typescript\ninterface User \{ id: string; \}\n```/);
  assert.match(e.draft, /```typescript\ninterface User \{ id: string; name: string; \}\n```/);
  // and so does everything AFTER the nested block
  assert.match(e.current, /Trailing table after the code block\.$/);
  assert.match(e.draft, /Trailing line after the code block\.$/);
});

test('migrateWorksheet strips the client-only _live cache from entries and candidates', () => {
  const out = migrateWorksheet({
    round: 'r',
    scorecard: null,
    entries: [{
      tag: 'a', kind: 'strengthen', role: 'swe', targetFile: 'instructions/x.md',
      status: { state: 'ready' }, gap: 'g', decision: { verdict: 'park' }, applyLog: [],
      draft: 'd', _live: 'LIVE TEXT',
    }],
    candidates: [{
      tag: 'b', kind: 'new-rule', role: 'swe', targetFile: 'instructions/y.md',
      gap: 'g', priority: 'low', decision: { verdict: 'park' }, _live: 'LIVE TEXT',
    }],
  });
  assert.equal('_live' in out.entries[0], false, 'entry _live stripped');
  assert.equal('_live' in out.candidates[0], false, 'candidate _live stripped');
  // the rest of each object is preserved
  assert.equal(out.entries[0].draft, 'd');
  assert.equal(out.candidates[0].tag, 'b');
  assert.deepEqual(validateFile(out), [], 'stays schema-valid');
});
