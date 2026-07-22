---
'@vocdoni/api-types': minor
'@vocdoni/api-client': minor
---

Census surface aligned with the backend's "no census identity" design: the
process read already carries everything clients need, and the new
process-scoped admin routes replace the bundle-based census workarounds.

**`@vocdoni/api-types`:**

- `CensusSpec.size` — member count, response-only (`omitempty`; for published
  processes it equals the on-chain `maxCensusSize`). `groupId`/`memberIds`
  documented as create/update inputs that are not returned on reads.
- `VotingProcessBase.chainId` — the Vochain chain id votes are signed against
  (previously only available via `Bundle.chainId`).
- New `ProcessParticipantsResponse` / `ProcessParticipantEntry` /
  `ProcessParticipantQuestionVote` / `ProcessParticipantLookupField` /
  `UpdateProcessCensusResponse` types.

**`@vocdoni/api-client`:**

- `elections.participants(id, { field, value })` — admin census-member lookup
  (`GET /processes/{id}/participants`) with per-question voted status.
- `elections.addCensusMembers(id, memberIds)` — append org members to a
  published process's census (`PUT /processes/{id}/census`); the returned
  `jobId` tracks the async on-chain `maxCensusSize` bump.
- Fix: `elections.validate()` now targets the real dry-run route
  `GET /processes/{id}/validation` — it previously hit
  `/processes/{id}/check`, which is the public POST CSP voter-eligibility
  route and always failed with a method mismatch.
