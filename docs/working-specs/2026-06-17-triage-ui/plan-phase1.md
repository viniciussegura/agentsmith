# Plan: triage-ui Phase 1 -- JSON worksheet + apply migration

Status: Draft

Executes Phase 1 of [spec.md](spec.md) (Approved): replace the markdown triage worksheet with `triage.json`, migrate `/instruction-review` (emit) and `/instruction-apply` (consume), and retire the markdown parse contract from the skill prose. Shippable without the UI (the JSON is hand-editable). Satisfies spec ACs 1-7. No new `package.json` dependency; no `ownership.yaml`/`#tag` change.

## Phase 1a -- Schema + helpers module (the one testable JS artifact)

1. `devtools/triage-ui/schema.mjs` (dev-only; outside `tools/<ai>/`, so never exported/published):
   - `validateFile(obj)` / `validateEntry(entry)` -- enforce the discriminated unions (kind required fields; `Status`/`Decision` required params; `blocked`/`conditional` need `blockedOn`; `reject`/`defer`/`refine`/`fold` need `details`; `fold` needs `foldTarget`). Returns a list of per-entry problems (empty = valid).
   - `validateCrossRefs(file, { liveTags, resolvableOwners })` -- `fold.foldTarget` ∈ liveTags; `reowner.proposedOwner` ∈ resolvableOwners. (Caller supplies the sets from `node bin/cli.js --stdout` + `roles.yaml`; keeps the module pure/testable.)
   - `canonicalJSON(obj)` -- `JSON.stringify` with **sorted keys**, 2-space indent, trailing `\n`. Used by the migration here and the server in Phase 2.
   - `versionToken(fileText)` -- `sha256(canonicalJSON(JSON.parse(fileText)))` via the built-in `crypto`.
2. `devtools/triage-ui/schema.test.mjs` (`node --test` picks it up): each kind's required-field pass/fail; each verdict/status param; cross-ref reject cases; `canonicalJSON` key-order stability; `versionToken` invariance under reformat + change under content edit.

## Phase 1b -- Migration (one-time, tested)

3. `devtools/triage-ui/migrate.mjs`: parse the existing `.agentsmith/instruction-review/triage.md` once (loose, format-specific) -> `triage.json` per schema. Map metadata/`current:`/`draft:`; `decision -> {verdict:'park'}`; `applyLog -> []`; `status -> {state:'ready'}`; `gap` verbatim. **Assert the parsed counts** (expect 23 strengthen w/ `current` + 9 new-rule = 32) and fail loudly on mismatch; validate the output with `schema.mjs` before writing `canonicalJSON`.
4. `devtools/triage-ui/migrate.test.mjs`: 1-2 representative markdown entries (one strengthen w/ current, one new-rule) -> expected JSON object.
5. Run `node devtools/triage-ui/migrate.mjs` once -> writes `.agentsmith/instruction-review/triage.json`; then **remove** `triage.md`. (Both gitignored; the JSON is per-machine.)

## Phase 1c -- Retire markdown grammar in the skill prose

6. `tools/claude/skills/instruction-review/SKILL.md`:
   - **Step 5 (worksheet format):** rewrite to "emit `triage.json` per the schema" (drop the markdown entry shape, fences, checkbox, markers).
   - **Setup gate:** `N`/`K` from `decision.verdict` (`K` counts `{adopt,reject,fold,defer}`, excludes `park`/`refine`); ignore/consider/stop; consider-merge dedup in JSON terms (live in `node bin/cli.js --stdout` / decisions log; replace only an untouched non-ready park); stop archives to `triage.prev.json`.
   - **A1 validate:** `JSON.parse` + the schema + cross-ref checks (replacing the marker/fence/checkbox/sentinel grammar); malformed -> reported + skipped.
   - **A3/A4:** read typed `decision`; ensure-end-state per kind unchanged (strengthen `^## #<tag> -> next ## / EOF` survives); decisions-log canonical grammar from typed fields; per-entry **splice + atomic `canonicalJSON` rewrite** (re-emit survivors semantically unchanged); failure -> per-entry snapshot restore + `decision={verdict:'park'}` + push `applyLog` + continue; report buckets unchanged; `current` never read.
7. `tools/claude/skills/instruction-review/proposal-format.md`: replace the worksheet-grammar + decisions-log-driver prose with the JSON schema + typed-field driver (keep the decisions-log canonical line formats).
8. `tools/claude/agents/instruction-editor.md`: emit entries to the JSON schema, still carrying the verbatim `current` for strengthen; `rationale` folds into `gap`.
9. `tools/claude/commands/instruction-review.md` + `instruction-apply.md`: update references (`triage.json`, typed decisions).

## Phase 1d -- Final

10. `node bin/cli.js` (regenerate `.claude/**`); `npm test` green (existing 88 + the new schema/migration tests); sweep `tools/` prose for surviving markdown-worksheet grammar references (markers/fences/checkbox/sentinel/`decisionText`) that would contradict the JSON model.

## Notes
- `.claude/**` + `AGENTS.md` are gitignored build artifacts -- regenerate, don't hand-edit.
- `devtools/` is **not** in `package.json` `files` and **not** matched by `src/tools.js` -> not exported, not published (Phase 2 adds an explicit test; Phase 1 just places the files there).
- Commit user-gated (`#git-*`); separate commit from the spec (`c37bdd1`).
- Phase 2 (server + UI + diff) is a separate plan on this same schema.
