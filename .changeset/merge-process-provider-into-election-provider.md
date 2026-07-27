---
'@vocdoni/react-providers': major
'@vocdoni/react-components': major
---

Merge `ProcessProvider` into `ElectionProvider`. The CSP voter session (auth0/auth1/resend/check/sign) and the election data + vote flow always target the same voting process, so the two-provider split bought no real composability — one provider now does everything, matching the pre-migration SDK's mental model.

- `useElection()` additionally exposes the session: `authToken`, `auth0`, `auth1`, `resend`, `check`, `sign`, plus `chainId`. `clearVoter()` clears the session and the vote state.
- New `useElectionAuth()` hook reads the session from its own context, so auth-only widgets (identify forms, OTP inputs, logout buttons) don't re-render on election data/results updates. Its `clear()` also resets the vote state (`hasVoted`, `voteId`, `isInCensus`).
- BREAKING: `ProcessProvider`, `useProcess`, `useProcessOptional`, `ProcessContextValue`, `ProcessProviderProps` and `ProcessSignResult` are removed. Replace `<ProcessProvider id><ElectionProvider id>` nesting with a single `<ElectionProvider id>`; replace `useProcess()` with `useElectionAuth()` (session) or `useElection()` (everything). `ProcessSignResult` is now `ElectionSignResult`.
- BREAKING: `processQueryKeys` is renamed to `electionQueryKeys` (`.process(id)` → `.election(id)`; key shapes are unchanged, so seeded caches keep working).
