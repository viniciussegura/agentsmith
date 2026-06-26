# #swe-deep-modules Deep modules

Favor deep modules: a simple interface over a substantial implementation. The surface a caller must understand stays small relative to the functionality it hides (#swe-public-surface-docs).
- Hide implementation detail behind the interface; pull complexity downward so callers carry less of it.
- Define errors out of existence where you can: shape the interface so a class of error cannot arise, rather than exposing it for every caller to handle (#swe-errors).
- A shallow module -- interface nearly as complex as its body -- adds cost without hiding much; collapse it or deepen it.

This complements #swe-decomposition: decomposition says *when* to split a unit by responsibility; this says *what a good boundary looks like* once split.
