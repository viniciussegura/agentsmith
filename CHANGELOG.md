# Changelog

A `<target>-rc.<pr>` heading is an unpublished pre-release, one per pull request, collapsed into the dated release heading when the release is cut (`#local-pr-version` in `AGENTS.md`); `## Earlier` covers the pull requests merged before versions were assigned.

## 1.0.0-rc.28

- One records document, a lean README, and capped notes (#28)
- **Upgrade.** `#swe-future-work` and `#swe-technical-debts` now name a note's exact headings; rewrite existing notes under `docs/future-work/` and `docs/technical-debts/` to them, since nothing in a consumer repo enforces the shape.

## 1.0.0-rc.27

- Make the repo conform to its own rules (#27)

## 1.0.0-rc.26

- Remap `#swe-docs-layout` rows from a project config (#26)

## 1.0.0-rc.25

- Remove temp directories in the test that creates them (#25)

## 1.0.0-rc.24

- Repair the review-board Workflow driver and plan scope line (#24)

## 1.0.0-rc.23

- Rework `#git-pr` and add `#code-prose` (#23)
- **Breaking.** `#git-pr-body` is removed; consumers citing it move to `#git-pr`.
- **Breaking.** `#git-pr`'s body structure is narrower: a verification section is present only when `#swe-done`'s untestable exception is invoked.
- **Breaking.** The model list is gone from the PR body; attribution lives on the commit trailer, carried across the squash by the human merging.

## 1.0.0-rc.22

- Make working specs uncommitted branch scratch (#22)
- **Breaking.** `agentsmith spec-index [--check]` is removed; drop that step from any done-gate that used it.
- **Upgrade.** A working spec is now branch scratch under `.agentsmith/specs/<branch>/<date>-<slug>/`, gitignored, per-machine, and deleted when the branch ships; a unit's durable record is its PR body.
  If your project adopted the earlier workflow, two manual steps follow, in this order:
  1. Cross-check the specs before deleting them.
     Git makes the contents recoverable, not discoverable: nobody greps deleted files.
     Scan for anything still live that exists only there (an open question, an accepted shortcut, a decision that never graduated) and move it to `docs/future-work/`, `docs/technical-debts/`, or `docs/design-decisions/` first.
     Specs still at `Draft` or `Approved`, or with no `Status:` line, are the ones to read closely.
  2. Then delete `docs/working-specs/`.
     What remains is point-in-time history the current rules never consult; there is no index to regenerate and no `spec-index` command.

## 1.0.0-rc.21

- Add epic planning tier (`#swe-epic`) (#21)

## 1.0.0-rc.20

- Portable INDEX header and consumer install docs (#20)

## 1.0.0-rc.19

- GitHub-target `npx` fallbacks and plugin-only instruction lifecycle (#19)

## 1.0.0-rc.18

- Redesign CLI to verb-first subcommands (#18)

## 1.0.0-rc.17

- Terminology audit and spec-review guard hardening (#17)

## 1.0.0-rc.16

- Add branch lifespan and consolidation audit, tier `#swe-done` (#16)

## Earlier

- Add `#ai-done` and `#ai-multiple-requests` (#15)
- Docs-layout and session rules, triage-apply hardening, and review-board adoptions (#14)
- Board unification and installer prune (#13)
- Records architecture and adapter tooling batch (#12)
- Project-file coexistence, `#swe-deep-modules`, drift guidance (#11)
- Spec review: specialist fan-out, engine application 3 (#10)
- Branch-base and scratch-artifact gates (#9)
- Reduce review-board token cost: JSON store, `persist.mjs`, Workflow driver (#8)
- Split authoring tools (`--dev`) and Claude plugin packaging (#7)
- Instruction-review triage workflow, lean generator, scorecard UI (#6)
- Restructure specs into working-specs and reference-spec workflow (#5)
- Make `--user` a self-contained user-global setup (#4)
- Add spec auto-review protocol and agent tooling (#3)
- Map instructions to folders and add a back-end bundle (#2)
- On-demand instruction bundles and instruction rule overhaul (#1)
