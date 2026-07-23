---
'@vocdoni/react-providers': minor
---

Expose session expiry and external token injection from `AuthProvider` / `useAuth`.

`useAuth()` now returns `expiry` (the current token's expiry timestamp, read from
`AuthToken.expirity`) and `setSession(session)`, which stores a token obtained
out-of-band (e.g. OAuth or an app's own login mutation) without calling the API.
`login()` and `refresh()` now capture and persist the expiry and return the full
`AuthToken` (awaiting them for side effects only remains backwards compatible).
Expiry is persisted to `localStorage` under `${storageKey}.expiry` alongside the
token, and `logout()` clears both. No auto-refresh timers are added — the
consuming app owns its renew policy.
