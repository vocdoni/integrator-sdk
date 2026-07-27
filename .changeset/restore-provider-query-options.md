---
'@vocdoni/react-providers': minor
'@vocdoni/react-components': minor
---

Restore per-provider react-query configuration, lost in the migration. `ElectionProvider` accepts `queryOptions` (the election read) and `resultsQueryOptions` (the results read — e.g. `refetchInterval` for live tallies); `OrganizationProvider` accepts `queryOptions`. `queryKey`/`queryFn`/`initialData` stay provider-owned and `enabled` is AND-ed with each provider's own guard, so options can tune but not break the reads. `organizationQueryKeys` is now exported for cache pre-seeding/invalidation, mirroring `electionQueryKeys`.
