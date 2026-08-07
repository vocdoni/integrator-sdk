# @vocdoni/api-client

## 1.2.1

### Patch Changes

- fbe32bf: Refuse questions that publish an option no voter can cast.

  A ballot config can be perfectly satisfiable and still carry a choice that is dead on
  arrival. That failure is nastier than an all-zero tally: the election runs, most votes
  count, and the unreachable option quietly polls zero while `voteCount` keeps rising.
  Confirmed against a live chain (`integration/value-skew.itest.ts`) — the API accepts the
  config, the relay accepts the ballot, the chain counts the envelope, and the scrutinizer
  discards it at aggregation with no error on any surface:

  ```
  API ACCEPTED the malformed election (values 1/2/3 under maxValue 2)
  member 1 → wire [1] relay=completed
  member 2 → wire [3] relay=completed
  voteCount  = 2
  raw matrix = [["0","1","0"]]     ← C1 counted, C3 lost
  ```

  - New `uncastableChoicesReason(question)` / `hasUncastableChoices(question)` explain
    the defect, or return `null`/`false` when every choice is reachable. The rule follows
    how each layout addresses its fields:
    - **single-choice** is _value_-addressed (the field carries `choice.value` and the
      results row is indexed by it), so every value must fit `0..maxValue` and no two
      choices may share a value — duplicates read the same column, so one vote is counted
      for both and the percentages sum past 100. Sparse values are legal and deliberate;
      `maxValue` is derived from the highest value, not the option count, and unused
      columns simply stay empty. `maxValue: 0` means unbounded, not a ceiling of zero.
    - **pick-slot multichoice** shares one value space with the abstain sentinels
      (`choices.length`, `+1`, …, and decode claims every column `>= choices.length`), so
      its values must be exactly the _set_ `0..choices.length-1` — in any order, since
      nothing in that layout is positional — and `maxValue` must still clear the highest
      of them.
    - **approval / dense multichoice / budget / quadratic** are position-addressed, where
      `choice.value` is a display label the wire never sees, and carry no constraint.
  - `client.elections.create/update` rejects the config at creation, where it is still
    fixable; after publish the only remedy is a new election. This is a gap the backend
    does not cover — `VoteTypeFromQuestion` passes a raw `ballotProtocol` straight through
    without ever comparing it to the question's own choice values.
  - At **encode** time the two halves of the rule are treated differently, because they
    fail differently:
    - A value above `maxValue` is already caught per ballot by `assertEncodedBallot`, so
      only the voter picking the unreachable option is refused. The live run above shows
      why the line is drawn there: on such an election the in-range votes are still
      tallied correctly, and refusing everybody would discard ballots the chain records
      fine. `encodeBallot` / `encodeQuestionBallot` now explain _why_ when this happens,
      replacing the wire-level "field 0 is 3, above maxValue 2" with the election-level
      diagnosis. Failure path only — a healthy vote pays nothing for it.
    - A pick-slot value colliding with the abstain sentinels has no per-ballot backstop:
      the colliding values are _within_ `maxValue`, so no individual ballot is wrong while
      abstentions and real picks are being conflated. That one is refused up front, for
      every voter.
  - `validateSelections` mirrors the same split, so a UI gating its submit button on it no
    longer enables a vote that `encodeBallot` then refuses.
  - `isPickSlotLayout(question)` is now the single home for the pick-slot/dense
    discrimination, replacing three hand-written copies (one of them a de Morgan'd
    negation) in encode, decode and the reachability check.
  - `@vocdoni/react-components` no longer renders the encoder's creator-facing explanation
    as a voter's field error. A question that cannot accept votes shows a voter-appropriate
    message (`errors.question_not_votable`); the technical detail goes to the console.

  Only reachable through a raw `ballotProtocol`: the named types either derive their bounds
  _from_ the values (`singlechoice`) or ignore them entirely (`multichoice`). Decoding is
  unchanged — single-choice results are read by `choice.value`, which is the backend
  contract (saas-backend `account/ballot.go` and `db/types.go`) and is now pinned by unit
  tests and a live round-trip (`raw matrix = [["0","1","1","1"]]` for values 1/2/3, column 0
  empty) so it is not "fixed" into positional indexing. See integrator-sdk#28.

- Updated dependencies [d9212f0]
- Updated dependencies [a5f94b1]
- Updated dependencies [4491324]
- Updated dependencies [fbe32bf]
  - @vocdoni/api-types@1.2.0
  - @vocdoni/ballot@1.1.0

## 1.2.0

### Minor Changes

- e7a7dae: Stop creating multichoice elections whose votes are silently discarded at tally.

  The backend derives the **dense** layout for `type: 'multichoice'` (one 0/1 field per
  choice, `maxTotalCost = typeSetup.maxChoices`) while also mapping
  `typeSetup.uniqueChoices` onto the on-chain `voteMode.uniqueValues`. The scrutinizer
  applies `uniqueValues` to the raw field values, so a 0/1 vector over more than two
  choices always repeats one — even a single pick, `[1, 0, 0, 0]`, repeats `0`. Every
  ballot was rejected during aggregation while the vote still counted towards
  `voteCount`, producing elections that reported an all-zero tally with
  `finalResults: true`.

  - `@vocdoni/api-client`: `elections.create` / `elections.update` now reject
    `typeSetup.uniqueChoices` on `multichoice` questions, and reject a raw
    `ballotProtocol` that is unsatisfiable, instead of publishing an election that cannot
    be tallied. Both checks mirror what the API itself enforces, so this fails fast and
    locally without masking the server's answer — a ranked ballot is expressed as a raw
    `ballotProtocol` instead. Adds `@vocdoni/ballot` as a dependency.
  - `@vocdoni/ballot`: new `unsatisfiableProtocolReason`, `unsatisfiableQuestionReason`,
    `isUnsatisfiableProtocol`, `isUnsatisfiableQuestion`, `voteTypeBounds`,
    `assertEncodedBallot` and the `ProtocolBounds` type, plus `isDenseBallotProtocol` is
    now exported. `encodeBallot`, `encodeQuestionBallot` and `validateSelections` throw
    on an unsatisfiable config rather than encoding a ballot that will never count.
    `unsatisfiableQuestionReason` works off `type` + `typeSetup` too, so a UI can flag an
    already-created broken question from a public read (which omits the derived protocol).

    The guard covers the _product_ as well as the config: both encoders now run
    `assertEncodedBallot` on every ballot they build and throw when a field exceeds
    `maxValue` or repeats a value the protocol requires unique (duplicate ranks on a
    ranked ballot, both picks of a two-field dense unique layout, an out-of-range
    single-choice value) — a satisfiable config still admits ballots the chain accepts,
    counts in `voteCount`, and silently drops during aggregation, and a vote must either
    count or fail loudly. `validateSelections` mirrors the same rules on raw selections
    (duplicate unique picks, repeated amounts on a legacy unique budget shape), and
    `unsatisfiableProtocolReason` returns `null` on malformed bounds instead of a
    NaN-laden reason.

  - `@vocdoni/api-types`: documents the constraint on `BallotProtocol.uniqueValues` and
    `QuestionTypeSetup.uniqueChoices`.
  - `@vocdoni/react-components`: the vote form catches these encode-time rejections and
    marks the offending question invalid instead of letting them escape `handleSubmit`
    as an unhandled promise rejection on an already-broken election.

  Already-published elections with this config cannot be repaired — their votes are on
  chain but were never aggregated. The derivation bug itself is upstream
  (vocdoni/saas-backend#619), so processes created outside this SDK are still affected.

### Patch Changes

- Updated dependencies [e7a7dae]
- Updated dependencies [e7a7dae]
- Updated dependencies [242f6f0]
  - @vocdoni/ballot@1.0.0
  - @vocdoni/api-types@1.1.2

## 1.1.1

### Patch Changes

- f84bf33: Surface extended choice info (per-choice image and description) on process reads

  The API stores a choice's image/description on its **parent question**, under
  `metadata.choices` keyed by choice `value` — `db.Choice` is `{Title, Value}` and
  has nowhere to put it. The display components have always read it off
  `choice.meta`, and nothing mapped between the two, so images and descriptions
  were stored correctly and dropped on read: every question rendered
  `basic`/`list`.

  - `@vocdoni/api-types`: `Choice` gains a `meta?: ChoiceMeta`
    (`{ description?, image?: { default?, thumbnail? } }`), plus a
    `ChoiceMetadataEntry` type documenting the storage form. Both are open bags —
    creator-defined keys are part of the contract, not stripped.
  - `@vocdoni/api-client`: `elections.get`, `elections.list`,
    `elections.getQuestion` and `processes.getQuestion` now fold
    `metadata.choices` onto the matching choice as `choice.meta`. Both stored
    image shapes are tolerated — a plain URL string is normalized to
    `{ default: url }`, an object is passed through — and entries matching no
    choice are ignored. `description`/`image` are validated; every other key on
    the entry rides along untouched, so custom `QuestionChoice` slots keep seeing
    the open bag they saw when meta lived on the choice directly. The `value` join
    key is stripped. Exported as `normalizeQuestionChoiceMeta` for hand-normalizing
    raw wire data.
  - `@vocdoni/react-providers`: `<ElectionProvider election>` runs a prefetched
    process through the same normalization, so extended choices (and normalized
    statuses) are right on the first paint instead of only after the refetch.
  - `@vocdoni/react-components`: questions with extended choice info render the
    `extended` presentation again, and the `grid` layout when a choice has an
    image. `ipfs://` URLs and empty descriptions keep behaving as before.

  Two rendering fixes ride along, where the layout and `compact` checks read
  `choice.meta.image.default` raw while the presentation check read it through
  `getQuestionChoiceMeta`:

  - A whitespace-only image URL no longer flips a question to the `grid` layout
    with nothing to show in it — it is trimmed away like every other empty-ish
    string, and the question stays `basic`/`list`.
  - A thumbnail-only image now counts for the layout too. The default choice
    renderer resolves `image.thumbnail ?? image.default`, so such a choice did
    render an image, but inside a control styled as image-less.

  No stored data is migrated — both image shapes are tolerated on read.

  Released as a patch across the board on purpose. `api-types`/`api-client` are
  additive (a new optional field and a new export), which would normally be a
  minor — but `react-components`/`react-providers` **peer**-depend on them, and
  Changesets bumps a peer dependent to _major_ on any peer bump. That would push
  them to `3.0.0` and out of the `^2.0.0` range the consuming app pins, for what
  is a read-side bug fix.

- Updated dependencies [f84bf33]
  - @vocdoni/api-types@1.1.1

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
