# Normalize line endings once in `src/docslayout.js` instead of per site

Date: 2026-09-30

## What it is

`src/docslayout.js` tolerates CRLF at four independent sites rather than normalizing once at its boundaries:

| site | form |
| --- | --- |
| `parseLayoutTable` | `moduleText.split(/\r?\n/)` |
| `parseLayoutConfig` | a real normalizer -- BOM strip, `\r\n?` to `\n`, per-line trailing-whitespace strip |
| the external-note block regex | `\r?\n` alternatives inside the pattern |
| `mappedPrefixLint` | `text.split(/\r?\n/)` |

Only the second is a normalizer. The other three are local tolerance in whatever expression happened to need it, which is the shape `#swe-consolidation-audit` calls a re-invented workaround: one missing capability worked around at N sites.

The fix is one internal helper applied at each entry point that takes text from outside the module -- config text and module text -- after which the regexes downstream can assume LF.

## Why it matters

Nothing is broken, so this is consistency rather than a defect, and it is recorded at that weight.

The cost is that a fifth site added later has no obvious convention to follow, and the author re-decides. The note-block regex is the one to watch: its `\r?\n` alternatives are load-bearing for the byte-level strip contract, so a later edit that assumes LF there would change emitted output rather than fail loudly.

Two facts bound how much this can bite today. `.gitattributes` sets `* text=auto eol=lf`, so every module text read from the repo is already LF; and the CRLF cases that reach the parser at all are config files a consumer authored, which `parseLayoutConfig` normalizes properly.

## Constraints and dependencies

- Purely internal to `src/docslayout.js`; no public surface changes and no behavior change.
- The acceptance properties that pin CRLF handling (`U5`'s positive CRLF and BOM cases) must keep passing unchanged -- they are the signal that a consolidation did not quietly drop tolerance.
- Those CRLF and BOM inputs are constructed in code, never committed as fixtures, because `.gitattributes` would normalize a committed fixture away. Any refactor keeps that.

## Status

Raised 2026-09-30 by the branch consolidation audit on the docs-layout-config unit (`feat/project-docs-layout-config`), and deliberately not fixed there: it is a consistency cleanup touching production code at the end of a branch whose own gate is byte-identical output, so the risk/benefit favoured recording it over churning.
