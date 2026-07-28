---
'@vocdoni/react-providers': major
'@vocdoni/react-components': major
---

Complete rewrite for the Vocdoni SaaS API. Both packages are rebuilt on `@vocdoni/api-client`/`@vocdoni/api-voting` (the SaaS multi-question `/processes` model) instead of `@vocdoni/sdk` and direct chain access: one `ElectionProvider` per voting process drives election data, the CSP voter auth session (`useElectionAuth`) and the phased multi-question vote flow (`vote()`, `PartialVoteError`, per-question `voteStatus`), with `ClientProvider`/`AuthProvider`/`OrganizationProvider`/`ActionsProvider` around it and react-query as the fetching layer. Peer dependencies change accordingly: `@vocdoni/sdk`, `@ethersproject/*` and `react-router` are gone; `@tanstack/react-query` and the `@vocdoni/api-*` workspace packages are required. APIs kept from the old packages keep their names and props (`id`/`election` prefetching, `queryOptions`, `useElection`, the `<Election* />` components); anything tied to the legacy single-election/bundle model is removed.
