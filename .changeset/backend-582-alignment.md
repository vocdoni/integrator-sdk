---
'@vocdoni/api-types': minor
'@vocdoni/api-client': minor
---

Align with the saas-backend `/processes` migration cleanup (saas-backend#582:
jobs/apikeys consolidation) and fill audited coverage gaps.

Breaking (routes the backend removed — the old methods 404ed against a current
backend anyway):

- API keys moved under `/integrator`: `organizations.listApiKeys` /
  `createApiKey` / `revokeApiKey` now call
  `/integrator/organizations/{addr}/apikeys[/{keyId}]`.
- `organizations.listJobs`, `organizations.getMembersJob` and
  `organizations.waitForMembersJob` (and `WaitForMembersJobOptions`,
  `AddMembersJobResponse`, `JobInfo`) are removed. Jobs are unified: list org
  jobs via the new `jobs.list({ orgAddress, type?, page?, limit? })`
  (`GET /jobs`), and poll member/census imports with `jobs.waitFor(jobId)` —
  import progress now lives in `job.result.added/total/progress`.
- `JobStatusResponse.error` (string) is now `errors?: string[]`;
  `JobFailedError` joins them into its message. `JobType` gains
  `set_process_census` and `publish_voting_process`.
- Integrator quota types match the backend again: `IntegratorLimits` is
  `{ maxManagedOrgs, maxManagedProcesses, maxVotes, maxSMS, maxEmails }`
  (0 = unlimited), `IntegratorUsage` is
  `{ managedOrgs, managedProcesses, sentVotes, sentSMS, sentEmails }`, and
  `IntegratorInfo.limits` is optional (omitted when `enabled` is false).
  `CreateManagedOrganizationRequest` is now `CreateOrganizationRequest &
  { ownerEmail?: string }` (gains `name`, `integrator`, etc.).

New:

- `client.info()` — public `GET /info` (`{ chainId, version, goVersion }`;
  the chainId is the service's current chain, not a per-process value).
- `elections.validateCensus(...)` — `POST /processes/census/validation`.
- `organizations.addMembers(..., { async: true })` — opt into background
  import, returning a `jobId` for `jobs.waitFor`.
