# @vocdoni/api-client

## 1.1.0

### Minor Changes

- 180a9b3: Support the batch vote relay (`POST /votes`, saas-backend#610). New `RelayVotesRequest` and per-envelope `VoteJobResult` types, the `relay_votes` job type, and `JobResult` gains `nullifier`/`processId` (seeded at job creation on relay jobs — readable while pending) plus `votes` (batch outcomes in request order; present on failed jobs too). `elections.voteBatch()` relays up to 100 signed envelopes in one call that the backend accepts or rejects as a unit, and `jobs.waitFor()` gains an `onPoll` callback to observe intermediate job states (e.g. batch entries settling one by one). Also documents that `CensusSpec.groupId` round-trips on process reads since saas-backend#606 (and that org-wide censuses no longer report an all-zeros `groupID` on the org censuses list).

### Patch Changes

- 8212fcd: Normalize the wire question status `READY` to `ONGOING` at the read boundary. The backend emits `READY` for a live question — semantically identical to `ONGOING`, the only name `QuestionStatus` declares — which leaked through `elections.get`/`list`/`getQuestion` and broke every `status === 'ONGOING'` comparison downstream (e.g. `VoteButton` disabling itself on a live process). All process/question reads now map it via the exported `normalizeQuestionStatus`/`normalizeVotingProcess`, and `computeProcessStatus` also normalizes defensively so raw wire data that skipped the client (e.g. SSR payloads passed to `<ElectionProvider election>`) derives correctly too. The lowercase `ready` of the write API (`SetElectionStatusRequest`, bulk question status) is unchanged.
- Updated dependencies [180a9b3]
- Updated dependencies [41497df]
- Updated dependencies [8212fcd]
  - @vocdoni/api-types@1.1.0

## 1.0.0

### Major Changes

- a280996: Drop the legacy bundle flow (breaking): the backend removed every
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

- f6ed4f3: Remove `BundleClient.getParticipant()` (breaking). The by-id participant reads
  — bundle-scoped and the process-scoped equivalent — were backend placeholders
  that always returned `null` (pending a CSP indexer lookup that never landed),
  no frontend ever called them, and the backend is removing the endpoints from
  the API. Voter status checks go through `check()` / `signInfo()` /
  `participantsCheck()`; admin member lookups through `elections.participants()`.
- 0b4c33b: Confirmed-review fixes across the per-question model surface.

  **`@vocdoni/api-client` (breaking):**

  - `elections.update()` now resolves `void` — the backend answers a bare
    `200 OK` with no body, so the previous `Promise<string>` never carried the
    process id it claimed to. Re-`get()` the process if you need the updated shape.
  - `elections.delete()` now targets the new-model `DELETE /processes/{id}` route.
  - `elections.signInfo()` migrated to `POST /processes/{id}/sign-info` and now
    returns the per-question `ProcessSignInfoResponse` (`{ consumed: [...] }`)
    instead of the legacy single-election `ConsumedAddressResponse`.
  - `setStatus()`/`setStatusAndWait()` and `getMetadata()` are documented as
    legacy-only (single-election model, vochain ids); new-model lifecycle goes
    through `setQuestionStatus()`/`bulkSetQuestionStatus()`.
  - Fix: the client's response parser no longer throws `SyntaxError` on the bare
    `200 OK` (`"\n"`) bodies the backend writes for update/delete/status
    endpoints — blank bodies now resolve as empty instead of failing JSON.parse.

  **`@vocdoni/api-types`:** new `ProcessSignInfoResponse` /
  `QuestionConsumedAddress` types; `QuestionStatusID` JSDoc corrected (it is the
  per-question entry of `SetQuestionsStatusRequest`, not a request body).

  **`@vocdoni/ballot`:** the per-question helpers no longer guess.
  `inferQuestionBallotType()` falls back to the named question `type`
  (`singlechoice`/`multichoice`) when `ballotProtocol` is missing and throws
  instead of silently assuming single-choice; `encodeQuestionBallot()` throws on
  more than one selection for single-choice questions (previously extras were
  silently dropped) and on multichoice questions lacking a `ballotProtocol`.

- 2a0cbed: Migrate from monolithic `Election` to `VotingProcessResponse` with per-question model.

  **Breaking changes:**

  - `@vocdoni/api-types`: Introduces `VotingProcessResponse`, `VotingProcessQuestion`, `BallotProtocol`, `QuestionStatus`, and `VotingProcessResultsResponse`. The old `Election` type is removed.
  - `@vocdoni/api-client`: `elections.get()` now returns `VotingProcessResponse` (hits `GET /processes/{id}`). New `elections.getResults()` method (`GET /processes/{id}/results`). Exports `computeProcessStatus(questions)` which derives a top-level `QuestionStatus` from all question statuses.

  **New features:**

  - `@vocdoni/ballot`: New exports `inferQuestionBallotType`, `encodeQuestionBallot`, `decodeQuestionResults`, `questionReservesAbstain`, `questionSelectionRange` — per-question ballot helpers based on `BallotProtocol`.

  (The react-providers/react-components side of this migration is tracked in a
  separate changeset, held back until the React packages release.)

### Minor Changes

- 915f278: Align with the saas-backend `/processes` migration cleanup (saas-backend#582:
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

- 9bb1937: Census surface aligned with the backend's "no census identity" design: the
  process read already carries everything clients need, and the new
  process-scoped admin routes replace the legacy census workarounds.

  **`@vocdoni/api-types`:**

  - `CensusSpec.size` — member count, response-only (`omitempty`; for published
    processes it equals the on-chain `maxCensusSize`). `groupId`/`memberIds`
    documented as create/update inputs that are not returned on reads.
  - `VotingProcessBase.chainId` — the Vochain chain id votes are signed against
    (previously unavailable on process reads).
  - New `ProcessParticipantsResponse` / `ProcessParticipantEntry` /
    `ProcessParticipantQuestionVote` / `ProcessParticipantLookupField` /
    `UpdateProcessCensusResponse` types.

  **`@vocdoni/api-client`:**

  - `elections.participants(id, { field, value })` — admin census-member lookup
    (`GET /processes/{id}/participants`) with per-question voted status.
  - `elections.addCensusMembers(id, memberIds)` — append org members to a
    published process's census (`PUT /processes/{id}/census`); the returned
    `jobId` tracks the async on-chain `maxCensusSize` bump.
  - Fix: `elections.validate()` now targets the real dry-run route
    `GET /processes/{id}/validation` — it previously hit
    `/processes/{id}/check`, which is the public POST CSP voter-eligibility
    route and always failed with a method mismatch.

- 7801e6d: Process listing and status helpers (previously uncovered by any changeset):

  - `elections.list({ orgAddress, page?, limit?, status? })` now targets the
    new-model `GET /processes` route and returns `VotingProcessListResponse`
    (`{ processes, pagination }`). List items carry no tallies — fetch
    `elections.getResults(id)` per process when you need vote counts.
  - New status predicates exported from `@vocdoni/api-client` alongside
    `computeProcessStatus`: `isLive`, `isUpcoming`, `hasResults`,
    `isSecretUntilTheEnd`, and `processVoteCount(results)` (derives a
    process-level ballot count from a results response).

- b3dd6b9: `jobs.waitFor` accepts a new optional `expectType` in `WaitForJobOptions`; when set, a completed job with a different type now throws instead of resolving silently.
- 0d630b3: Expand `Organization` to faithfully match the SaaS `apicommon.OrganizationInfo`
  schema returned by `GET /organizations/{address}`.

  **Breaking:** `Organization.name`, `description`, and `logo` are now
  `MultilingualText` (locale maps, e.g. `{ default: 'Acme' }`) instead of plain
  `string`s — they are shorthands for `meta["name"]` / `meta["description"]` /
  `meta["logo"]`. Resolve `.default` (or the first value) when displaying them.

  New `MultilingualText` type (`Record<string, string>`). `Organization` now also
  carries `color`, `size`, `type`, `country`, `timezone`, `subdomain`, `active`,
  `communications`, `integrator`, `createdAt`, `managedBy`, `meta`, `counters`
  (`SubscriptionUsage`), `subscription` (`SubscriptionDetails`), and a recursive
  `parent`. `address` stays a hex `string` (the swagger models it as a byte array).
  `SubscriptionUsage` gains `sentVotes`. The standalone `OrganizationInfo` interface
  is now a type alias of `Organization` (same schema, used by managed-org flows).

  `CreateOrganizationRequest` accepts `string | MultilingualText` for `name` /
  `description` / `logo` (a plain string is stored as `{ default: value }`) and gains
  the writable profile fields; `provisionAccount` is unchanged.

- 0f27337: Bundle-less voter CSP flow: new `ProcessesCspClient` exposed as `client.processes`,
  wrapping the process-scoped CSP routes (`/processes/{processId}/auth/{step}`,
  `auth/resend`, `check`, `sign`, `weight`, `sign-info`, and the public
  `questions/{questionId}` read). A voter flow now needs only the process's Mongo
  id — auth tokens are anchored to the process, `chainId` comes from the process
  read, and `sign()` takes each question's `upstreamId` as `electionId`.

  api-types:

  - New `ProcessCheckResponse` / `ProcessQuestionStatus` — the process check
    returns `belongsToProcess` plus per-question `canVote`/`hasVoted` entries
    (one call reports every question).
  - `encryptionKeys?: EncryptionKey[]` added to `VotingProcessQuestion` and
    `PublicQuestionResponse` (absent until the keykeepers publish — poll before
    building an encrypted ballot).
  - Auth request shapes exposed as `AuthRequest` /
    `AuthChallengeRequest` (the shapes are shared by both CSP flows); the old
    names remain as deprecated aliases.

### Patch Changes

- d65439b: Align with saas-backend #595, #596 and #599 (public draft-gated process reads,
  live per-question results, census totalWeight):

  - New `QuestionResults` type (`voteCount`, `maxVoters`, `finalResults`,
    `results?: string[][]`) — the live on-chain tally resolved on the single
    reads (`GET /processes/{id}` and the public question read) for any published
    question; list items never resolve it (N+1 avoidance).
  - `VotingProcessQuestion.results?` and `PublicQuestionResponse.results?` typed
    accordingly.
  - `VotingProcessQuestionResults` (the `GET /processes/{id}/results` entry)
    reshaped to `QuestionResults` + `questionId`/`upstreamId` — the old
    `status`/`startDate`/`endDate` fields are gone from the backend response and
    `voteCount`/`finalResults` are now optional.
  - `CensusSpec.totalWeight?` (saas-backend#595): whole-census total voting
    weight, response-only; equals `size` for a non-weighted census.
  - `GET /processes` and `GET /processes/{id}` are now **public and draft-gated**
    (saas-backend#599): published processes — including their `chainId` — are
    readable without auth, drafts 404 to non-managers, and `eligibleMemberIds`
    is stripped for non-managers. `elections.get`/`list`/`getResults` docs
    updated; voter apps no longer need an integrator-backend `chainId` handoff.

- Updated dependencies [915f278]
- Updated dependencies [d65439b]
- Updated dependencies [9bb1937]
- Updated dependencies [a280996]
- Updated dependencies [7801e6d]
- Updated dependencies [0d630b3]
- Updated dependencies [19a0b09]
- Updated dependencies [0f27337]
- Updated dependencies [0b4c33b]
- Updated dependencies [2a0cbed]
  - @vocdoni/api-types@1.0.0

## 0.0.1

### Patch Changes

- Initial release
- Updated dependencies
  - @vocdoni/api-types@0.0.1
