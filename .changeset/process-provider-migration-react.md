---
'@vocdoni/react-providers': major
'@vocdoni/react-components': minor
---

Migrate the React voter flow to the process-scoped CSP routes (the backend dropped the bundle routes):

- `BundleProvider`/`useBundle` removed; the voter session is anchored to the voting process Mongo id and exposes `auth0`/`auth1`/`resend`/`check`/`sign` — one verified token covers every question of the process.
- `ElectionProvider`: new `voterQuestions` (per-question `canVote`/`hasVoted` from the CSP check); `hasVoted` derives as "every question voted"; read-only use (results, status) needs no auth session at all.
- `vote()` signs via `processes.sign` and seals `secretUntilTheEnd` ballots with `question.encryptionKeys` — encrypted voting now works in React. A secret question with unpublished keys throws before the CSP sign is consumed (never casts cleartext).
