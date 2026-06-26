# Agent instructions

Applies to human contributors and AI assistants (Claude Code, Copilot, Codex, Cursor, Gemini, etc.).
Precedence on conflict: user instructions in the active conversation > a more project-specific instruction file > this file.
A project-scoped instruction file may override any rule here -- **EXCEPT** the safety baseline (#git-secret-history, #ai-untrusted-content, #swe-security, #ai-tool-safety), which a project may tighten but not waive.
Each rule carries a `#tag` so it can be referenced in conversation.
