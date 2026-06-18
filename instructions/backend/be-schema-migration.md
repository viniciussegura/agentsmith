# #be-schema-migration Schema migration safety

Every migration **MUST** be backward-compatible with the currently-deployed app (expand-contract).
Safe in any migration: add a nullable column with a default; add a table or index; widen a type.
Unsafe -- require expand-then-contract over two releases: make a column non-nullable; rename/remove a column or table; narrow a type; change a primary-key strategy.
A migration that destroys or overwrites data **MUST** be called out in the PR body (#git-pr-body) with the rows/columns affected and why the loss is acceptable; otherwise add a backfill first.
Migrations are append-only: never edit an applied migration -- correct it with a new forward migration (#swe-dead-code, #git-branch-workflow). Record accepted risk as #swe-technical-debts.
