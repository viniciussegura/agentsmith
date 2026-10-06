# Normalize line endings once in `src/docslayout.js` instead of per site

## What

`src/docslayout.js` tolerates CRLF at four independent sites rather than normalizing once at its boundaries; only `parseLayoutConfig` is a real normalizer, the other three are local tolerance in whatever expression needed it, the shape `#swe-consolidation-audit` calls a re-invented workaround.
Apply one internal helper at each entry point that takes text from outside the module (config text and module text), after which the downstream regexes can assume LF.

| site | form |
| --- | --- |
| `parseLayoutTable` | `moduleText.split(/\r?\n/)` |
| `parseLayoutConfig` | BOM strip, `\r\n?` to `\n`, per-line trailing-whitespace strip |
| the external-note block regex | `\r?\n` alternatives inside the pattern |
| `mappedPrefixLint` | `text.split(/\r?\n/)` |

## Why it matters

Nothing is broken, so this is consistency; the cost is that a fifth site added later has no convention to follow.
The note-block regex is the one to watch: its `\r?\n` alternatives are load-bearing for the byte-level strip contract, so a later edit that assumes LF there would change emitted output rather than fail loudly.
Two facts bound the exposure: `.gitattributes` sets `* text=auto eol=lf`, so module text read from the repo is already LF, and the CRLF inputs that reach the parser are consumer-authored config files, which `parseLayoutConfig` normalizes properly.

## Constraints

- Internal to `src/docslayout.js`; no public surface change and no behavior change.
- The acceptance properties that pin CRLF handling (the positive CRLF and BOM cases) keep passing unchanged; they are the signal that a consolidation did not drop tolerance.
- Those CRLF and BOM inputs are constructed in code, never committed as fixtures, because `.gitattributes` would normalize a committed fixture away.
