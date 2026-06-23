# #swe-reuse Reuse before creation

Before creating any code unit -- component, hook, utility, helper, service, data-access layer, schema definition, or type -- search the codebase for one with the same name or purpose.
Two implementations of the same concept in different modules or directories is a bug: consolidate into one shared implementation and delete the duplicate -- do not leave both.
Serve one concept from a single shared implementation across pages, services, or endpoints rather than duplicating it.
