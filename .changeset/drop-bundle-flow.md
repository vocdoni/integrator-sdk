---
'@vocdoni/api-types': major
'@vocdoni/api-client': major
---

Drop the legacy bundle flow (breaking): the backend removed every
`/process/bundle/*` route — all voter logic is process-scoped now.

- **api-client**: `BundleClient` and `client.bundle` are gone (auth, check,
  sign, weight, participantsCheck, create, get); `organizations.listBundles()`
  removed (its route no longer exists — list processes via `elections.list()`).
- **api-types**: removed `Bundle`, `CreateProcessBundleRequest/Response`,
  `BundleParticipantsCheckRequest/Entry/Response`, `OrganizationBundle`,
  `OrganizationBundlesResponse`, `CheckMembershipResponse`, and the deprecated
  `BundleAuthRequest`/`BundleAuthChallengeRequest` aliases.
  `CheckMembershipRequest` stays — the process check (`POST
  /processes/{id}/check`) shares that wire shape.

Migration: replace `bundle.authStep0/1/check/sign(bundleId, …)` with
`client.processes.authStep0/1/check/sign(processId, …)` (the check reports
every question at once), and read `chainId` from the public
`elections.get(processId)` instead of the bundle info.
