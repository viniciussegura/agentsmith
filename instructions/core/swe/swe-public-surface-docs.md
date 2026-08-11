# #swe-public-surface-docs Document new public surface

New public surface ships documented in the same change -- a CLI command or flag, endpoint, exported function or type, config key, or env var (#swe-environment).
State what it does, its inputs and outputs, and one example, where consumers already look (`README`, `docs/`, or the reference spec #swe-reference-spec) -- not only in code comments.
Those four are the whole entry, written per #code-prose: one worked example does more than a paragraph describing the shape of one.
Removing surface is the mirror: delete its doc in the same change (#swe-docs-drift).
