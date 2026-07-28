---
'@vocdoni/react-providers': minor
---

`ElectionProvider.vote()` can no longer half-vote a multi-question process silently (#5). Casting is now phased: every question is pre-flight-validated (upstreamId, published encryption keys) and every transaction CSP-signed and built **before** anything is relayed — a failure in those phases aborts with zero votes on chain. A fresh `processes.check()` on entry skips questions already voted, so calling `vote()` again after a failure resumes the remaining questions instead of failing on a double-vote. When some questions land and others fail at relay/confirmation, `vote()` refreshes the voter state to the on-chain truth and throws the new `PartialVoteError` (exported), which names `succeeded` (with per-question vote ids) and `failed` (with per-question errors) so UIs can offer a retry.

Note: the vochain has an ordered batch-submit endpoint (`POST /chain/transactions/batch`, vocdoni-node#1420), but saas-backend does not expose it to voters yet — `POST /vote` takes one signed envelope. Until it does, the relay phase is one call per question; once a SaaS batch relay exists, the already-built transactions can go out in a single call and shrink the partial window to nothing.
