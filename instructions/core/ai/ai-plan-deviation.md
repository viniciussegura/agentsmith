# #ai-plan-deviation Mid-execution plan deviation

When executing an approved plan, if a step proves invalid, an assumption turns out false, or the scope must widen beyond the plan, stop and surface it -- do not silently adapt.
State the deviation (what changed, which step), propose the minimal correction, and wait for confirmation before continuing.
This stop-and-surface pause holds even under #ai-preflight non-stop mode -- a deviation always pauses for confirmation.
A scope widening is new work: it needs its own spec or plan approval (#ai-plan), even when discovered mid-execution.
When the widened scope is approved and constitutes a plan of its own, re-run #ai-preflight for that plan before executing it -- the original preflight answers do not carry over.
A narrowing -- a step proves unnecessary -- may proceed, but is reported at the next natural pause.
