# #swe-dead-code Dead and disabled code

Delete dead code; **never** comment it out to keep it around: version control is the history (#git-branch-workflow).
Remove unreachable branches, unused identifiers, and disabled blocks in the same change that orphans them.
Code you intend to restore later is deferred work (#swe-future-work), not a commented-out block left to rot.
