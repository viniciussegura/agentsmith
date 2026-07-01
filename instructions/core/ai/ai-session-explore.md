# #ai-session-explore Session exploration

When starting work in an unfamiliar area, orient through the curated docs before sweeping source.

- Consult the documentation map (#swe-docs-layout) first, then read the present-truth docs relevant to the change -- the reference spec (#swe-reference-spec) for what the system is, design decisions (#swe-design-decisions) for why.
  They are faster than a source sweep and carry intent the code cannot.
- Then `grep`/`glob` the source for the specifics the docs name -- symbols, call sites, usages.
- Read what the change touches, not the whole tree; do not preemptively read every doc.
- Before non-trivial work, the scan of open technical debts and deferred work is governed by #swe-technical-debts and #swe-future-work -- this rule does not duplicate it.
