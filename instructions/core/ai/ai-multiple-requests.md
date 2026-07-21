# #ai-multiple-requests Multiple requests from users

If the user asks the AI agent multiple requests (_e.g._ changes, fixes) the process should be:

1. In the current working directory, in a `tmp` folder create a directory with the name "<timestamp in YYYY-MM-DD format>-<slug>".
  Inside it, two files: a `original.md` file, containing the original user message; and a `annotated.md` file, with the agent's understanding of **each** individual user request item, prefixing it with a checklist and an unique tag (_e.g._ "- [ ] #<slug> <item description>") to each item.
2. All items should be covered by working specs or task lists.
3. During the conversation, the agent may reference the tag instead of the complete item.
4. In persisted files (_e.g._ specs), the agent should **NOT** use the tag, since they live in a temporary file.
5. As the request items are being solved, the agent should mark the checklist done annotating between double square brackets when the solution landed (_e.g._ "- [x] [[fixed in commit <commit hash>]]", "- [x] [[registered in <file path>]]").

The work session is only considered done if **all** items in the `annotated.md` file are solved.
