# #swe-reuse Reuse before creation

Before creating a component, utility, hook, or helper, search the codebase for one with the same name or purpose.
Two implementations of the same concept in different directories is a bug: consolidate into one shared implementation and delete the duplicate -- do not leave both.
Serve one concept from a single shared implementation across pages or endpoints rather than duplicating it.
