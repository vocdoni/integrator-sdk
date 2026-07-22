---
'@vocdoni/api-types': major
'@vocdoni/api-client': major
'@vocdoni/ballot': minor
---

Migrate from monolithic `Election` to `VotingProcessResponse` with per-question model.

**Breaking changes:**

- `@vocdoni/api-types`: Introduces `VotingProcessResponse`, `VotingProcessQuestion`, `BallotProtocol`, `QuestionStatus`, and `VotingProcessResultsResponse`. The old `Election` type is removed.
- `@vocdoni/api-client`: `elections.get()` now returns `VotingProcessResponse` (hits `GET /processes/{id}`). New `elections.getResults()` method (`GET /processes/{id}/results`). Exports `computeProcessStatus(questions)` which derives a top-level `QuestionStatus` from all question statuses.

**New features:**

- `@vocdoni/ballot`: New exports `inferQuestionBallotType`, `encodeQuestionBallot`, `decodeQuestionResults`, `questionReservesAbstain`, `questionSelectionRange` — per-question ballot helpers based on `BallotProtocol`.

(The react-providers/react-components side of this migration is tracked in a
separate changeset, held back until the React packages release.)
