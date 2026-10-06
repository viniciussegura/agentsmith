# Docs-layout config

`.agentsmith/docs-layout.yaml` tells the generator where a project keeps each kind of record.
The `#swe-docs-layout` rule ships a table of five documentation locations, each defaulting to a directory under `docs/`; with this file in place, `install` emits that table describing the project's layout instead of agentsmith's defaults, so every rule citing the map tells an agent the truth about this repo.
A member of the reference spec (`#swe-reference-spec`); the records the table lists are described in [`records.md`](./records.md).

## Writing the file

The file is yours: `install` reads it, never creates or modifies it, and `uninstall` leaves it in place.
Rows are keyed by the bare owner tag of the row being remapped, and each row declares exactly one of two forms:

- **`path:`** -- *relocated*: this record type lives at a different path in the repo.
- **`external:`** -- *external*: this record type is served by a tracker, so an item is registered there instead of a file being written here.
  Only two rows are eligible: `swe-technical-debts` and `swe-future-work`.

```yaml
# .agentsmith/docs-layout.yaml
rows:
  swe-design-decisions:
    path: docs/adr/<decision-slug>.md
  swe-technical-debts:
    external: jira/ENG
```

Indentation is exact: `rows:` at column 0, a row key at two spaces, a field at four.
Comments follow YAML: a `#` as a line's first non-space character comments the whole line, and a `#` after whitespace that follows content runs to the end of that line.
Values are written unquoted.

## What `install` does with it

`install` discloses the remap on the plan it asks you to confirm:

```text
  layout  2 row(s) remapped from .agentsmith/docs-layout.yaml: swe-design-decisions -> docs/adr/<decision-slug>.md, swe-technical-debts -> external -- jira/ENG
```

The emitted table then reads `` `docs/adr/<decision-slug>.md` `` for the design-decisions row and ``external -- `jira/ENG` `` for the technical-debts row.
For an `external` row the map also gains a paragraph telling an agent to register, scan, update, and close in that tracker wherever the owner rule names a file.

## Validation

Parsing is deny-by-default: an unknown key, an unknown owner tag, a row declaring both forms or neither, a duplicate row, wrong indentation, or a path or label outside the allowed characters is an error naming the file and line, exit `1`, with nothing written.
The config arrives with any clone or pull request and its values become instruction text an agent reads, so that strictness is a security boundary rather than an ergonomic check.

Five rules are worth knowing before you write one:

- A path starts with a **literal directory** and goes at least one level deep.
  A bare name at the repository root is refused, and so is a first segment carrying a placeholder (`<slug>/notes.md`), because either leaves the root for an agent to name.
  A placeholder below that root is fine: `docs/epics/<slug>/` is the shipped epics default.
- A path may **not name** `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` or `package.json` in any segment, and no directory segment may be `node_modules` or begin with a dot.
  Each of those rules is applied to every segment on its own, once with its placeholders standing for a name and once with them removed, so `AGENTS<name>.md`, `docs/<slug>.git/` and `docs/<slug>.git/<name>` are refused as well.
- Three rows must **keep a placeholder**, because something else resolves their records individually: `swe-reference-spec` keeps `<name>`, `swe-design-decisions` keeps `<decision-slug>`, and `swe-epic` keeps `<slug>`.
  The other two rows are free to drop theirs and declare a different naming pattern, down to a single file for the whole record type.
  `swe-epic` carries one extra requirement -- its path must still end in `/` -- because an epic is a directory per record holding `README.md`, `roadmap.md` and the rest, which a file per epic cannot.
- No two rows may **resolve to the same location**, counting the defaults of rows you did not remap: pointing `swe-future-work` at `docs/technical-debts/` makes an agent read deferred items as debts, since the debts rule says that directory holds only open debts.
  Locations are compared case-insensitively and ignoring a trailing slash, because `docs/Notes/` and `docs/notes/` are one directory on Windows and macOS, and a file `docs/notes` cannot coexist with a directory of that name.
  A row's location is the fixed part of its path, up to its first placeholder -- so `docs/<slug>/index.md` is a directory per record under `docs/`, not the one fixed file its file name suggests.
  Nesting is otherwise fine -- the whole map nests under `docs/` -- with one asymmetry: a row storing each record as its own directory claims every directory at its location, so both `swe-epic: docs/<slug>/` and that `index.md` form are refused for reading the other rows' directories as their own records, while `swe-technical-debts: docs/<YYYY-MM-DD>-<slug>.md` claims only the files there and is accepted.
- A row key is the **bare** tag: write `swe-future-work:`, not `#swe-future-work:` -- the hashed form of a real row tag is an error, with or without a trailing comment, because reading it as a comment drops the key and leaves its field lines to attach to the row above, remapping that one instead.
  Every other `#` line is an ordinary comment, so a space after the `#` is how you comment a row out -- and comment its field lines out with it.

## Previewing

`agentsmith --stdout` deliberately reads no config and always prints the defaults; `agentsmith install --dry-run` is the way to preview a remapped set.

## Committing the file

The file is a team decision and travels with the repo.
Both gitignore recipes in the [README](../../README.md#usage) deny `.agentsmith/` wholesale, so the config needs its `!.agentsmith/docs-layout.yaml` re-admit or teammates never receive it -- `install` warns when git reports the file ignored.
