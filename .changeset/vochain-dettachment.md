---
'@vocdoni/api-types': major
'@vocdoni/api-client': major
'@vocdoni/ballot': minor
'@vocdoni/react-providers': major
'@vocdoni/react-components': minor
---

Migrate from monolithic `Election` to `VotingProcessResponse` with per-question model.

**Breaking changes:**

- `@vocdoni/api-types`: Introduces `VotingProcessResponse`, `VotingProcessQuestion`, `BallotProtocol`, `QuestionStatus`, and `VotingProcessResultsResponse`. The old `Election` type is removed.
- `@vocdoni/api-client`: `elections.get()` now returns `VotingProcessResponse` (hits `GET /processes/{id}`). New `elections.getResults()` method (`GET /processes/{id}/results`). Exports `computeProcessStatus(questions)` which derives a top-level `QuestionStatus` from all question statuses.
- `@vocdoni/react-providers`: `useElection()` returns `election: VotingProcessResponse | null`, `status: QuestionStatus | null` (computed), and `results: VotingProcessResultsResponse | null`. `vote()` signature changed from `vote(choices: number[])` to `vote(encodedBallots: number[][])` — one encoded ballot array per question.

**New features:**

- `@vocdoni/ballot`: New exports `inferQuestionBallotType`, `encodeQuestionBallot`, `decodeQuestionResults`, `questionReservesAbstain`, `questionSelectionRange` — per-question ballot helpers based on `BallotProtocol`.
- `@vocdoni/react-components`: Components updated for the new process model. `QuestionStatus` values now use `ONGOING` (replaces `READY`).
