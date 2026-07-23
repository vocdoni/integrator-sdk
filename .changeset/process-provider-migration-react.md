---
'@vocdoni/react-providers': major
'@vocdoni/react-components': minor
---

Migrate the React voter flow to the process-scoped CSP routes (the backend
dropped the bundle routes):

- `BundleProvider`/`useBundle` removed; new `ProcessProvider`/`useProcess`/
  `useProcessOptional` take the process Mongo id, read the public process
  (`chainId`, census auth config, questions) via `elections.get()`, and expose
  `auth0`/`auth1`/`resend`/`check`/`sign`/`clear`.
- `ElectionProvider`: new `voterQuestions` (per-question `canVote`/`hasVoted`
  from the CSP check); `hasVoted` derives as "every question voted";
  `chainId` resolves `election.chainId ?? process.chainId` (read-only use
  works without a `ProcessProvider`).
- `vote()` signs via `processes.sign` and seals `secretUntilTheEnd` ballots
  with `question.encryptionKeys` — encrypted voting now works in React. A
  secret question with unpublished keys throws before the CSP sign is
  consumed (never casts cleartext).
- `electionQueryKeys` renamed `processQueryKeys` (shared by both providers, so
  nesting them on the same id yields a single fetch).
