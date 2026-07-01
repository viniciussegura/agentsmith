# #swe-security Security baseline

Beyond secrets (#swe-environment), treat all external input as untrusted: validate and sanitize at the boundary.
**Never** log secrets, tokens, or personal data; redact before logging.
Parameterize queries; **never** build SQL or shell commands by string concatenation.
Encode untrusted values before rendering: HTML-escape in HTML contexts, use safe DOM APIs (`textContent`, not `innerHTML`) in JS contexts; **never** splice untrusted data into HTML by concatenation.
**Never** build a server-side template or an LLM prompt by concatenating untrusted input: put user-supplied content in a delimited data slot following the sentinel protocol (#swe-prompt-injection-sentinel), never spliced into instruction text (template / prompt injection). 
This sentinel protocol is part of the non-waivable security baseline, not an optional add-on.
Where CI is available, scan dependencies for known vulnerabilities and clear criticals before merge.
Where an authn/authz layer exists, it is never optional: enforce it on every endpoint that exposes data or mutations, deny by default, and cover every new data or mutation path before it ships.
Authorization is per-resource, not just per-endpoint: verify the authenticated principal owns or may access the specific object requested; a missing ownership check is an authorization defect even when the endpoint is otherwise protected (IDOR).
State-mutating endpoints **MUST** be protected against cross-site request forgery: a synchronizer token, `SameSite` cookie attribute, or framework equivalent; document the mechanism.
Whether such a layer is warranted is a deployment- and threat-model decision -- a local-only or single-trusted-user tool may legitimately hold private data without one -- but running without authn/authz is a deliberate, documented stance, never an accidental gap.
