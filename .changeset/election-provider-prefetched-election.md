---
'@vocdoni/react-providers': minor
---

Restore `ElectionProvider`'s `election` prop for prefetched data. The provider again accepts a `VotingProcessResponse` (e.g. from SSR or a list view) and renders it immediately with no loading state, seeding it into the react-query cache as `initialData` — so it still refetches by id once the data goes stale. `id` is now optional and derived from `election.id` when omitted; the props type requires at least one of the two. A prefetched election whose id mismatches an explicit `id` prop is ignored rather than seeded under the wrong cache entry.
