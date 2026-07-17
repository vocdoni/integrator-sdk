---
"@vocdoni/api-client": minor
---

`jobs.waitFor` accepts a new optional `expectType` in `WaitForJobOptions`; when set, a completed job with a different type now throws instead of resolving silently.
