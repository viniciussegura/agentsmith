# #be-api-error-envelope Error response envelope

Every error response (4xx, 5xx) uses one stable JSON shape across the service: `{ error: { code: string, message: string, details?: unknown } }`.
`code` is a machine-readable constant (_e.g._ `'NOT_FOUND'`, `'VALIDATION_ERROR'`), never a raw HTTP status phrase.
The error envelope is part of the versioned contract (#be-api-versioning): renaming a `code` value or restructuring the envelope is a breaking change.
Do not return a different error shape from different endpoints.
