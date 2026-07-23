---
'@vocdoni/react-providers': patch
---

ElectionProvider: treat a 404 from `GET /processes/{id}/results` as "no results yet". The results query now resolves to `null` on 404 instead of erroring, so react-query no longer retries an endpoint that legitimately 404s before results exist.
