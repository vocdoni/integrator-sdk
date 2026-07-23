---
'@vocdoni/react-components': major
'@vocdoni/react-providers': minor
---

Pagination and cache-control surface (previously uncovered by any changeset):

**Breaking (`@vocdoni/react-components`):** pagination is always 1-based — the
`initialPage` abstraction was dropped from `PaginationProvider` /
`RoutedPaginationProvider` and the `Pagination` components. The
`RoutedPagination` component is exported from the package root again.

**`@vocdoni/react-providers` / `@vocdoni/react-components`:** both packages
export `electionQueryKeys` (the TanStack Query keys `ElectionProvider` uses for
its election and results fetches) so host apps can invalidate or prefetch that
cached state.
