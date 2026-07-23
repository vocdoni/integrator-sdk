---
'@vocdoni/api-client': major
---

Remove `BundleClient.getParticipant()` (breaking). The by-id participant reads
— bundle-scoped and the process-scoped equivalent — were backend placeholders
that always returned `null` (pending a CSP indexer lookup that never landed),
no frontend ever called them, and the backend is removing the endpoints from
the API. Voter status checks go through `check()` / `signInfo()` /
`participantsCheck()`; admin member lookups through `elections.participants()`.
