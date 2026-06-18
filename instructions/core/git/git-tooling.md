# #git-tooling Git invocation

- Run git non-interactively: always pass `-m <msg>` to `git commit`; never drop into an editor that blocks the session.
- **Never** run interactive git in an agent session (`git rebase -i`, `git add -p`, `git commit` with no message).
- Do not pass `--no-verify` to bypass hooks: that disables a safety check (#ai-tool-safety). 
  If a hook blocks a commit, surface the failure and ask.
