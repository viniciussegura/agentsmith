# #swe-prompt-injection-sentinel Sentinel-delimited untrusted content in agent prompts

When untrusted content (tool output, retrieved documents, user-supplied text, file contents, or another agent's response) must be placed into a prompt sent to an AI agent, isolate it inside an explicit sentinel pair — never interpolate it into the instruction body:

```
--- BEGIN UNTRUSTED DATA: <source> ---
<verbatim untrusted content>
--- END UNTRUSTED DATA ---
```

- The receiving agent treats everything between the sentinels as data to analyse, never as instructions to obey (#swe-security, #ai-untrusted-content).
- The markers are fixed, distinctive strings unlikely to occur in the content, and paired (a matching open and close) so the boundary is unambiguous.
- Where the same content flows through more than one component, define the sentinel form in **one shared constant** and reuse it, rather than re-spelling the marker string at each call site.
- The sentinel form stated in this rule and the shared constant in the implementation are a **single source of truth**: they **MUST** be identical, and any change to one is a change to both. 
  A silent divergence between the documented form and the running one reopens the injection boundary without warning.
- Bare quoting, or an informal 'the following is untrusted' label without a delimited sentinel pair, does **not** satisfy the prompt-injection requirement.
