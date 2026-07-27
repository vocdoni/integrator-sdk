---
'@vocdoni/api-client': patch
'@vocdoni/api-types': patch
---

Normalize the wire question status `READY` to `ONGOING` at the read boundary. The backend emits `READY` for a live question — semantically identical to `ONGOING`, the only name `QuestionStatus` declares — which leaked through `elections.get`/`list`/`getQuestion` and broke every `status === 'ONGOING'` comparison downstream (e.g. `VoteButton` disabling itself on a live process). All process/question reads now map it via the exported `normalizeQuestionStatus`/`normalizeVotingProcess`, and `computeProcessStatus` also normalizes defensively so raw wire data that skipped the client (e.g. SSR payloads passed to `<ElectionProvider election>`) derives correctly too. The lowercase `ready` of the write API (`SetElectionStatusRequest`, bulk question status) is unchanged.
