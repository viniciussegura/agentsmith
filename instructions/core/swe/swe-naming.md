# #swe-naming Naming conventions

Each kind of name -- files, identifiers, types -- follows one convention, applied uniformly across the codebase.
A name says what a thing is or does, not how it is built; rename when its purpose drifts.
Match the surrounding code's existing convention over importing a new one (#swe-reuse); which word names a concept is governed by #swe-terminology.
When no convention is established for a kind of name, infer it from at least five existing names of that kind and apply it consistently from the first new name.
If it is not possible to infer, ask user.
Document a newly-established convention in the reference spec (#swe-reference-spec) so it is discoverable without reading the code.
