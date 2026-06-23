# Plan: triage-ui Phase 2 -- local web UI

Status: Draft

Executes Phase 2 of [spec.md](spec.md) (Approved): a dev-only, zero-dependency local web UI over `triage.json`. Depends on Phase 1's `devtools/triage-ui/schema.mjs` (validate + `canonicalJSON` + `versionToken`). Satisfies spec ACs 8-11. No new `package.json` dependency (Node built-ins only); `devtools/` stays unexported/unpublished.

## Phase 2a -- Diff (pure, testable first)

1. `devtools/triage-ui/diff.mjs`: a hand-rolled **LCS line-diff** -> an array of rows `{ type: 'same'|'add'|'del', text }` for a `current` vs `draft` pair (~80 LOC, no dep). Pure function.
2. `devtools/triage-ui/diff.test.mjs` (`node --test`): identical, pure-add (new-rule has no current), pure-delete, mixed change; empty inputs.

## Phase 2b -- Server (Node built-in `http`)

3. `devtools/triage-ui/server.mjs`:
   - `GET /` + static assets with a small hardcoded MIME map (`.html`/`.js`/`.css`/`.json`).
   - `GET /api/triage` -> `{ data, version }` (`version = versionToken(diskBytes)`; empty-state payload if the file is absent/unparseable -- never overwrites it).
   - `GET /api/tags` -> the live `#tag` set (parse `node bin/cli.js --stdout`) for the fold-target dropdown + cross-ref hints.
   - `PUT /api/triage` -> body `{ data, version }`: reject (409) if `version` != current disk token; else `validateFile` + `validateCrossRefs` (schema.mjs), write `canonicalJSON` via **temp + rename**, return the new `version`.
   - Bind localhost; single-user.
4. `devtools/triage-ui/server.test.mjs`: load/save round-trip; atomic-write (no torn file on simulated mid-write); stale-version `PUT` -> 409; unparseable file -> empty-state + never overwritten.

## Phase 2c -- Front-end (vanilla, no build)

5. `devtools/triage-ui/index.html` + `app.js` + `style.css` (layout B -- list + detail):
   - **Sidebar:** all entries with a verdict badge + decided/total counter; click to focus; current highlighted.
   - **Detail:** read-only metadata + `gap` -> **side-by-side current | draft diff** (red/green via `diff.mjs`); **editable draft** with live re-diff -> **decision** (6 choices incl. park) -> the verdict's field(s) (`fold` -> `#tag` dropdown from `/api/tags` **and** a reason; `reject`/`defer`/`refine` -> `details`) -> autosave.
   - **Autosave:** debounced `PUT` carrying the loaded `version`; on 409, reload (the file changed underneath -- a re-run round or an out-of-band `/instruction-apply`).
   - New-rule shows draft only (no current side); rehome/reowner w/o text change show metadata + proposed location/owner, no diff.

## Phase 2d -- Launch + guards

6. `package.json` `scripts.triage` = `node devtools/triage-ui/server.mjs`; the server prints the localhost URL and does a **best-effort browser open** (platform-branched `child_process`: `cmd /c start ""` on Windows; `open`/`xdg-open` elsewhere). No dependency.
7. `devtools/triage-ui/export.test.mjs`: assert `npm pack --dry-run --json` output contains **no** `devtools/` path, and a `node bin/cli.js` run produces **no** `.claude/**/triage-ui` file (AC10).

## Phase 2e -- Final

8. `npm test` green (diff + server + export tests added); manual UI smoke: load the migrated `triage.json`, navigate, edit a draft (diff updates), tick each verdict (conditional field appears), autosave persists, force a conflict (edit the file underneath) -> UI reloads.

## Notes
- Reuses Phase 1's `schema.mjs` (`validateFile`/`validateCrossRefs`/`canonicalJSON`/`versionToken`); the server is the only new writer that must call `canonicalJSON`.
- `/instruction-apply` is unchanged here (still an agent skill); the UI only writes `triage.json`.
- Commit user-gated (`#git-*`).
- Front-end interaction is verified manually (dev tool); the pure/`http` layers are unit-tested.
