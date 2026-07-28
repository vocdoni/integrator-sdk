---
'@vocdoni/api-types': minor
---

Add the `published?: boolean` drafts filter to `ElectionListParams` (saas-backend#607). `true` lists published processes only; `false` lists drafts only and requires Manager/Admin (401 otherwise); omitted keeps the caller's default view. Combining `published: false` with `status` returns nothing — drafts have no on-chain question status yet. `elections.list` already forwards the param; `published: false` is verified to serialize as `published=false` on the wire.
