# #ui-framework-idioms Framework-idiomatic state and effects

- Derive, don't mirror: a value computable from existing state or props is computed at render, never copied into separate state and resynced.
- Effects synchronize with external systems (DOM, subscriptions, non-UI libraries) -- not for deriving values from state or props. (React `useEffect`, Angular `effect`, Vue `watchEffect`, Svelte `$effect`.)
- **Never** hold server-fetched data in component-local state when a data-fetching cache already owns it (React Query, SWR, RTK Query, Angular `resource`/`httpResource`, Vue Query, or equivalent).
- State that always changes together is one unit of state.
- Every rendered list item carries a stable, unique `key` derived from entity identity -- **never** an array index; an index key causes incorrect reconciliation and stale state when the list is reordered or filtered.
