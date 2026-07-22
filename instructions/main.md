# Agent instructions

Applies to human contributors and AI agents (Claude Code, Copilot, Codex, Cursor, Gemini, etc.).
Precedence on conflict: user instructions in the active conversation > a more project-specific instruction file > this file.
A project-scoped instruction file may override any rule here -- **EXCEPT** the safety baseline (#git-secret-history, #ai-untrusted-content, #swe-security, #ai-tool-safety), which a project may tighten but not waive.
Each rule carries a `#tag` so it can be referenced in conversation.

This set's own process vocabulary, fixed at three altitudes:

| term | what it names |
| --- | --- |
| `deliverable` | what a branch delivers, at merge -- its scope of work, provisional and rarely written down in full |
| `unit of work` | one working spec, or a request landed without one (#ai-plan, #ai-multiple-requests) |
| `plan step` | an execution chunk inside a unit of work -- a step, a workstream, a commit |

| term | what it names |
| --- | --- |
| `ship` | a branch squash-merges to the default branch -- the `deliverable` is delivered |
| `land` | a `unit of work` completes on the branch |

No verb is fixed for the `plan step` altitude, because none is in contention.

These name the process, not a project's domain: a project's own concepts follow #swe-terminology.
