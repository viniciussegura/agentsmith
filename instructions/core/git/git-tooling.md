# #git-tooling Git tooling

Run git non-interactively: never invoke a command that opens an editor or pager without a flag that suppresses it (`--no-edit`, `-m`, `--no-pager`).
**Never** pass `--no-verify` or otherwise skip hooks unless the user explicitly asks.
When pushing a branch for the first time, pass `-u origin <branch>` (`--set-upstream`) so the tracking ref is set and later bare `git push` calls work; never rely on `push.default` being safe in the agent environment.
For subsequent pushes on an already-tracked branch, a bare `git push` is fine.
