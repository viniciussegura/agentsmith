import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorksheet } from '../devtools/triage-ui/migrate.mjs';
import { validateFile } from '../devtools/triage-ui/schema.mjs';

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

### swe-async   new-rule · swe · core/swe.md
- kind: new-rule
- role: swe
- targetFile: instructions/core/swe.md
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
