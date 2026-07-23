---
'@vocdoni/react-providers': major
'@vocdoni/react-components': minor
---

React layer of the `Election` → `VotingProcessResponse` per-question migration.

**Breaking (`@vocdoni/react-providers`):** `useElection()` returns
`election: VotingProcessResponse | null`, `status: QuestionStatus | null`
(computed via `computeProcessStatus`), and
`results: VotingProcessResultsResponse | null`. `vote()` signature changed from
`vote(choices: number[])` to `vote(encodedBallots: number[][])` — one encoded
ballot array per question.

**`@vocdoni/react-components`:** components updated for the new process model.
`QuestionStatus` values now use `ONGOING` (replaces `READY`).
