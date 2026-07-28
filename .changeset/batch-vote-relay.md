---
'@vocdoni/api-types': minor
'@vocdoni/api-client': minor
---

Support the batch vote relay (`POST /votes`, saas-backend#610). New `RelayVotesRequest` and per-envelope `VoteJobResult` types, the `relay_votes` job type, and `JobResult` gains `nullifier`/`processId` (seeded at job creation on relay jobs — readable while pending) plus `votes` (batch outcomes in request order; present on failed jobs too). `elections.voteBatch()` relays up to 100 signed envelopes in one call that the backend accepts or rejects as a unit, and `jobs.waitFor()` gains an `onPoll` callback to observe intermediate job states (e.g. batch entries settling one by one). Also documents that `CensusSpec.groupId` round-trips on process reads since saas-backend#606 (and that org-wide censuses no longer report an all-zeros `groupID` on the org censuses list).
