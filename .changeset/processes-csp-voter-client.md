---
'@vocdoni/api-types': minor
'@vocdoni/api-client': minor
---

Bundle-less voter CSP flow: new `ProcessesCspClient` exposed as `client.processes`,
wrapping the process-scoped CSP routes (`/processes/{processId}/auth/{step}`,
`auth/resend`, `check`, `sign`, `weight`, `sign-info`, and the public
`questions/{questionId}` read). A voter flow now needs only the process's Mongo
id — auth tokens are anchored to the process, `chainId` comes from the process
read, and `sign()` takes each question's `upstreamId` as `electionId`.
`BundleClient` (`client.bundle`) remains as the legacy bundle path.

api-types:

- New `ProcessCheckResponse` / `ProcessQuestionStatus` — the process check
  returns `belongsToProcess` plus per-question `canVote`/`hasVoted` entries
  (unlike the bundle's single-pair `CheckMembershipResponse`).
- `encryptionKeys?: EncryptionKey[]` added to `VotingProcessQuestion` and
  `PublicQuestionResponse` (absent until the keykeepers publish — poll before
  building an encrypted ballot).
- `BundleAuthRequest` / `BundleAuthChallengeRequest` renamed to `AuthRequest` /
  `AuthChallengeRequest` (the shapes are shared by both CSP flows); the old
  names remain as deprecated aliases.
