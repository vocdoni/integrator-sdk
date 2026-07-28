---
'@vocdoni/react-providers': minor
---

`ElectionProvider.vote()` now relays every question's envelope in ONE batch call (`POST /votes`) instead of one relay per question. The backend accepts or rejects the batch as a unit, so a rejection (bad payload, full queue…) relays nothing and surfaces as a plain, fully-retryable error — never a partial vote; `PartialVoteError` keeps its exact shape but is now only thrown for chain-level failures reported by the batch job's per-envelope outcomes. New `voteStatus` on `useElection()`: per-question progress of the current/last `vote()` call (`signing` → `submitting` → `confirming` → `confirmed` | `failed`, with already-voted questions as `confirmed`), updated live while the batch job settles — drive per-question spinners with it. `vote()` also refuses more than 100 questions per call (the relay cap) before consuming any CSP signature. Requires a backend with saas-backend#610.
