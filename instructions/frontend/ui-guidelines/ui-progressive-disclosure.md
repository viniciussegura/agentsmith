# #ui-progressive-disclosure Progressive disclosure: surface controls at the moment they are needed

**Rule.** Show the user only the controls and information relevant to their current task.
Secondary actions, advanced options, and destructive choices **MUST** be one level deeper (behind an expand, overflow menu, or detail view) until the user requests them.
**Never** present more than five primary actions simultaneously on a single view; collapse the rest under an overflow affordance.

**Why.** Displaying every available action at once forces the user to recall which one applies, rather than recognising the right one from a focused set (#front-nielsen-heuristics, recognition over recall).
This also reduces the probability of accidental destructive actions (#ui-destructive-confirm).
