---
'@vocdoni/react-providers': minor
'@vocdoni/react-components': minor
---

Surface every question's vote id, not just the first one.

**`@vocdoni/react-providers`:** `useElection()` gains `voteIds: Record<questionId, string>` — every nullifier the voter holds for the process. It is populated from the outcomes of `vote()`, from the questions that *did* land when `vote()` throws `PartialVoteError` (a partial cast no longer loses the ids it produced), and, on connect, recovered from `POST /processes/{id}/sign-info` when the membership check reports something voted — so a voter returning after a page reload still sees all of their ids instead of none. A sign-info failure is swallowed and leaves membership resolved. `voteId` keeps working unchanged and is now marked `@deprecated`: votes are relayed per question, so it only ever exposes one of them.

**`@vocdoni/react-components`:** `<Voted />` now renders one entry per voted question, pairing each question's title with its vote id (still link-ified), in process order. The `Voted` slot gains an additive `votes: VotedVote[]` prop (`{ questionId, questionTitle, voteId, description }`); the existing `description` prop now carries every line joined, so slot overrides written against the old single-string API keep showing all of the ids. A single voted question still renders the exact `vote.voted_description` sentence it did before; multiple questions use the new `vote.voted_question_description` key.
