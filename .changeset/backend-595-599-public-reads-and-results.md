---
'@vocdoni/api-types': minor
'@vocdoni/api-client': patch
---

Align with saas-backend #595, #596 and #599 (public draft-gated process reads,
live per-question results, census totalWeight):

- New `QuestionResults` type (`voteCount`, `maxVoters`, `finalResults`,
  `results?: string[][]`) — the live on-chain tally resolved on the single
  reads (`GET /processes/{id}` and the public question read) for any published
  question; list items never resolve it (N+1 avoidance).
- `VotingProcessQuestion.results?` and `PublicQuestionResponse.results?` typed
  accordingly.
- `VotingProcessQuestionResults` (the `GET /processes/{id}/results` entry)
  reshaped to `QuestionResults` + `questionId`/`upstreamId` — the old
  `status`/`startDate`/`endDate` fields are gone from the backend response and
  `voteCount`/`finalResults` are now optional.
- `CensusSpec.totalWeight?` (saas-backend#595): whole-census total voting
  weight, response-only; equals `size` for a non-weighted census.
- `GET /processes` and `GET /processes/{id}` are now **public and draft-gated**
  (saas-backend#599): published processes — including their `chainId` — are
  readable without auth, drafts 404 to non-managers, and `eligibleMemberIds`
  is stripped for non-managers. `elections.get`/`list`/`getResults` docs
  updated; voter apps no longer need an integrator-backend `chainId` handoff.
