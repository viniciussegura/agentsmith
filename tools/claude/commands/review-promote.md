---
description: Record the tracker URL for board issues, set status promoted, and move them to promoted/.
argument-hint: <issue-id...> <url>
---

Promote one or more code-review board issues into the official tracker. Arguments: $ARGUMENTS

Parse the arguments as one or more issue ids followed by the tracker URL/ref. For each issue id (use the `code-review-board` skill and `issue-format.md` for the store layout and schema):

- Set `promotedTo` to the URL and `status` to `promoted`, and move the file from `issues/<role>/` to `issues/<role>/promoted/`.
- `promoted` is **not** a closing status: the issue is now owned by the external tracker, so later rounds neither re-raise nor reopen it, and its `lastConfirmedCommit`/`locations` are frozen.
- If an epic has all children promoted (and none open), roll it up to `promoted` -> `epics/promoted/`.

This command is **idempotent**: an issue already `promoted` is skipped (report it), not re-promoted. This is the human-validation filter -- only a person runs it, and promotion is what moves an AI-raised issue into the team's real backlog.
