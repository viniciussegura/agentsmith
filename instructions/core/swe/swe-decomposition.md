# #swe-decomposition Unit decomposition

Split a unit (function, module, component, class) when it carries more than one distinct responsibility, or mixes I/O and data-fetching with the logic that consumes it.
Extract the side-effecting or data-access concern from the pure logic so each part is understood and tested on its own (#swe-testing).
This applies to any layer, not just the front end: a component that both fetches and renders splits into a data hook plus a presentational view, the same way a handler that both queries and computes splits into a repository plus pure logic.
Prefer composing small units over growing one large one (#swe-reuse); a unit that has grown to do too much is the signal to decompose.
