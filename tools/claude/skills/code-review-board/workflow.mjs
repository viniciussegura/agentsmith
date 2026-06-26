export const meta = {
  name: 'review-board-round',
  description: 'Run one review-board round deterministically: fan-out reviewers, verify, PM reduce, persist.',
  phases: [
    { title: 'Setup' },
    { title: 'Review' },
    { title: 'Verify' },
    { title: 'Reduce' },
    { title: 'Persist' },
  ],
};

// args: { store, roundId, roles, subjectRef } supplied by the /review-board-wf command.
const { store, roundId, roles, subjectRef } = args;

phase('Setup');
// The driver has already written round.json into scratch before invoking this workflow.
log(`round ${roundId}: ${roles.length} roles over ${subjectRef}`);

phase('Review');
await parallel(
  roles.map((role) => () =>
    agent(
      `You are the review-${role} reviewer. Read reviewer-common.md then review-${role}.md. ` +
        `Subject: ${subjectRef}. Write findings to ${store}/../tmp/review-board/${roundId}/findings/${role}.json ` +
        `per issue-format.md, then reply only with the path and counts.`,
      { label: `review:${role}`, phase: 'Review', agentType: `review-${role}` },
    ),
  ),
);

phase('Verify');
// One verifier per role: reads that role's findings file and writes a verdict per new id.
await parallel(
  roles.map((role) => () =>
    agent(
      `You are review-verifier. Read ${store}/../tmp/review-board/${roundId}/findings/${role}.json. ` +
        `For each entry in "new", adversarially verify it against ${subjectRef} (bias to reject) and write ` +
        `${store}/../tmp/review-board/${roundId}/verdicts/<id-safe>.json ({id,verdict,rationale}). Reply only with counts.`,
      { label: `verify:${role}`, phase: 'Verify', agentType: 'review-verifier' },
    ),
  ),
);

phase('Reduce');
await agent(
  `Run: node ${store}/../../.claude/skills/code-review-board/persist.mjs summary ${store} ${roundId}. Reply only with the exit line.`,
  { label: 'persist:summary', phase: 'Reduce' },
);
await agent(
  `You are review-pm. Read ${store}/../tmp/review-board/${roundId}/pm-input.json. Consolidate, group into epics, ` +
    `mark duplicates, optionally down-rank/reject with reasons. Write the human report to ` +
    `${store}/rounds/${roundId}.triage.md AND the directive to ${store}/../tmp/review-board/${roundId}/pm-directive.json ` +
    `per issue-format.md. Reply only with a one-line summary.`,
  { label: 'pm:reduce', phase: 'Reduce', agentType: 'review-pm' },
);

phase('Persist');
const persist = await agent(
  `Run: node ${store}/../../.claude/skills/code-review-board/persist.mjs apply ${store} ${roundId}. ` +
    `Report the full stdout/stderr and the exit code.`,
  { label: 'persist:apply', phase: 'Persist' },
);

return { roundId, persist };
