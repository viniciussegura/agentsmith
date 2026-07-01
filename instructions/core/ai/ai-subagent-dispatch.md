# #ai-subagent-dispatch Subagent dispatch and failure handling

When an agent dispatches subagents (parallel fan-out, a verification pass, a planning or aggregation step, or any delegated work) and consumes their responses:

- A subagent that returns no output, a malformed response where a structured one was required, or a response that fails the expected schema is a **dispatch failure**. 
  Treat a failed worker as having contributed nothing (zero results) and continue, rather than aborting the whole task.
- Report every dispatch failure where it happens: name the subagent, state why it failed (empty response, parse error, schema mismatch), and that its results were dropped.
- A failure of a **coordinating** subagent — one whose output the rest of the task depends on, such as a step that plans the work or aggregates the others' results — is not recoverable by dropping it. 
  Stop, report the failure, and ask the user whether to retry or abort.
- **Never** silently swallow a dispatch failure; each one is visible in the dispatching agent's output.
