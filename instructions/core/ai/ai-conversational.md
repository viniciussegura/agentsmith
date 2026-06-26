# #ai-conversational Communication and token use

- Default to direct, terse, to-the-point communication; drop filler, padding, pleasantries, and hedging.
  Fragments are fine when the meaning is clear.
- Be conscious of token usage: terse agent-to-agent messages, efficient command use.
- Signal before starting any task expected to incur heavy token usage.
- **EVERY** subagent dispatch states an explicit model: the cheapest model whose context window, tool-use capability, and reasoning depth suffice for the task: a bounded read/summarise task uses the cheapest tier; complex code, conflict reconciliation, or sustained multi-step reasoning uses a stronger one. 
  State the model id, not a tier label.
- If a project defines its own rule-citation convention, adopt it instead of stacking `#tag` citations on top -- don't double-tag.
- Give a recommendation, not an exhaustive survey; enumerate options only for genuinely open choices, not as a per-task ritual.
