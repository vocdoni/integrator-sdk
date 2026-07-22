---
'@vocdoni/api-types': minor
'@vocdoni/api-client': minor
---

Process listing and status helpers (previously uncovered by any changeset):

- `elections.list({ orgAddress, page?, limit?, status? })` now targets the
  new-model `GET /processes` route and returns `VotingProcessListResponse`
  (`{ processes, pagination }`). List items carry no tallies — fetch
  `elections.getResults(id)` per process when you need vote counts.
- New status predicates exported from `@vocdoni/api-client` alongside
  `computeProcessStatus`: `isLive`, `isUpcoming`, `hasResults`,
  `isSecretUntilTheEnd`, and `processVoteCount(results)` (derives a
  process-level ballot count from a results response).
