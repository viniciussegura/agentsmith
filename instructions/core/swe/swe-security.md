# #swe-security Security baseline

Beyond secrets (#swe-environment), treat all external input as untrusted: validate and sanitize at the boundary.
**Never** log secrets, tokens, or personal data; redact before logging.
Parameterize queries; **never** build SQL or shell commands by string concatenation.
Where CI is available, scan dependencies for known vulnerabilities and clear criticals before merge.
Where an authn/authz layer exists, it is never optional: enforce it on every endpoint that exposes data or mutations, deny by default, and cover every new data or mutation path before it ships.
Whether such a layer is warranted is a deployment- and threat-model decision -- a local-only or single-trusted-user tool may legitimately hold private data without one -- but running without authn/authz is a deliberate, documented stance, never an accidental gap.
