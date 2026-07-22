# Reference: @vocdoni/api-client

> ⚠️ **API surface in flux.** Sub-client method names and signatures are actively evolving. Always verify against the current source (`packages/api-client/src/`) rather than recalling from memory.

The typed HTTP client for the Vocdoni SaaS API. Wraps every SaaS endpoint; never talks to the blockchain directly.

```bash
pnpm add @vocdoni/api-client
```

---

## VocdoniApiClient

```ts
import { VocdoniApiClient } from '@vocdoni/api-client'

const client = new VocdoniApiClient({
  apiUrl: 'https://saas-api.vocdoni.net',
  // Optional — string or sync/async getter; resolved and attached as Bearer on every request
  authToken: () => myStore.getToken(),
})
```

`ApiClientConfig`:

| Field | Type | Notes |
|---|---|---|
| `apiUrl` | `string` | Base URL of the SaaS API |
| `authToken` | `string \| (() => string \| null)` \| async version | Optional; omit for public (voter) flows |

Sub-clients accessed as properties:

```ts
client.elections    // ElectionsClient
client.organizations // OrganizationsClient
client.census       // CensusClient
client.auth         // AuthClient
client.bundle       // BundleClient
client.jobs         // JobsClient
```

---

## BundleClient (`client.bundle`)

Manages the voter-facing CSP / two-factor auth flow for a bundle of processes. A bundle groups processes sharing a census; the voter authenticates once and reuses the token.

```ts
// Fetch public bundle info (chainId, processes, census config)
const bundle = await client.bundle.get(bundleId)
// bundle.chainId    — Vochain chain id (pass to buildVoteTransaction)
// bundle.processes  — on-chain process ids
// bundle.census     — { type, authFields, twoFaFields, ... }

// Auth step 0 — identify the voter
// Pass all fields the census requires (see bundle.census.authFields)
const res0 = await client.bundle.authStep0(bundleId, {
  memberNumber: '42',      // or: name, surname, birthDate, nationalId, email, phone
})
// res0.authToken — verified immediately if bundle.census.twoFaFields is empty (auth-only census)
//               — pending verification otherwise (proceed to step 1)

// Auth step 1 — confirm the 2FA OTP (skip for auth-only censuses)
const res1 = await client.bundle.authStep1(bundleId, {
  authToken: res0.authToken!,
  authData: ['123456'],    // OTP as first element
})
// res1.authToken — the now-verified token

// Resend challenge
await client.bundle.resend(bundleId, { authToken, email: 'voter@example.com' })

// Check census membership (and whether the voter already voted for a process)
const { belongs, hasVoted, weight } = await client.bundle.check(bundleId, {
  authToken,
  electionId: processId,   // vochain id (question.upstreamId); omit for bundle-level check
})

// Get CSP signature over an ephemeral voter address
const { signature, weight } = await client.bundle.sign(bundleId, {
  authToken,
  electionId: processId,   // vochain id
  payload: signer.address, // hex Ethereum address from EphemeralSigner
})
// signature — hex CSP signature; pass to buildVoteTransaction as cspSignature
// weight    — hex census weight; pass as cspWeight (may be undefined)

// Voter's census weight without a specific process
const { weight } = await client.bundle.weight(bundleId, { authToken })
```

**Census type detection** — check `bundle.census.twoFaFields`:
- Empty or absent → auth-only census; step 0 returns a verified token, skip step 1.
- Non-empty → 2FA census; step 0 returns a pending token, confirm with step 1.

---

## ElectionsClient (`client.elections`)

```ts
// Fetch a process by Mongo id — per-question vochain data lives on questions[]
const election = await client.elections.get(mongoId)
// election.id              — Mongo id (admin endpoints)
// election.orgAddress      — owner org address, UNPREFIXED lowercase hex.
//                            Other endpoints (auth/addresses, organizations/{address})
//                            return the same value 0x-prefixed — normalize before comparing.
// election.title           — MultiLangString ({ default, [lang]: string })
// election.census          — CensusSpec ({ weighted, authFields, twoFaFields, size?, ... })
//   census.size            — member count (response-only; omitted when 0). There is
//                            deliberately NO census type/uri/id over this API: the census
//                            "type" is inferred from authFields/twoFaFields (every
//                            new-model census is CSP-backed).
// election.questions       — VotingProcessQuestion[]
//   question.upstreamId        — vochain hex id (voting, bundle check/sign)
//   question.ballotProtocol    — { maxCount, maxValue, uniqueValues, ... }
//   question.secretUntilTheEnd — boolean
//   question.status            — QuestionStatus
// election.chainId         — vochain chain id votes are signed against (omitempty;
//                            same value as bundle.chainId).

// List processes
const { processes, pagination } = await client.elections.list({ orgAddress, page, limit, status })
// List items carry no tallies — vote counts require getResults() per process.

// Get per-question results
const { questions } = await client.elections.getResults(mongoId)
// questions[i] — { questionId, upstreamId, status, voteCount, finalResults,
//                 results?: string[][] (raw histogram; see ballot protocol) }

// Admin: create a draft process → returns the draft id (Mongo hex string).
// Text fields (title/description, question & choice titles) may be a plain
// string or a { default, <lang> } language map — plain strings are normalized
// to { default } for you. Each question carries its own type/ballotProtocol.
const draftId = await client.elections.create({
  orgAddress,
  title: 'My election',
  // endDate is required; omit startDate to start immediately on publish.
  endDate: new Date(Date.now() + 2 * 3_600_000).toISOString(),
  questions: [
    {
      title: 'Approve?',
      // Lowercase only: 'singlechoice' | 'multichoice'. camelCase is rejected
      // (40037 unsupported type). Alternatively pass a raw ballotProtocol
      // (which wins when both are given); omitting both is an error.
      // 'multichoice' requires typeSetup ({ maxChoices, minChoices, uniqueChoices });
      // 'singlechoice' ignores typeSetup.
      type: 'singlechoice',
      choices: [{ title: 'No', value: 0 }, { title: 'Yes', value: 1 }],
    },
  ],
})

// Admin: publish the draft on-chain. Async — returns { jobId } to poll (or
// { address, status } if already published). publishAndWait does the polling.
const published = await client.elections.publishAndWait(draftId)
// published.address — on-chain address from the publish job. The per-question
// vochain ids appear as questions[i].upstreamId on the next get(draftId).

// Admin: lifecycle — per-QUESTION status changes (the new model has no
// process-level status route). Async: each returns { jobId } to poll.
const { jobId: sjob } = await client.elections.bulkSetQuestionStatus(mongoId, {
  status: 'paused', // 'ready' | 'paused' | 'ended' | 'canceled'
  questions: process.questions.map((q) => ({ id: q.id })), // omit → all published questions
})
await client.jobs.waitFor(sjob)
// Single question: setQuestionStatus(processId, questionId, status).

// Admin: look up census members by credential, with per-question voted status.
// field is limited to 'email' | 'phone' | 'memberNumber' | 'nationalId'.
const { participants } = await client.elections.participants(mongoId, {
  field: 'memberNumber',
  value: '42',
})
// participants[i] — { memberId, name?, surname?, email?, memberNumber?,
//                     questions: [{ questionId, upstreamId?, hasVoted }] }

// Admin: append org members to a PUBLISHED process's census (append-only;
// drafts 409 — edit those via update()). jobId tracks the async on-chain
// maxCensusSize bump when one is needed.
const { added, jobId } = await client.elections.addCensusMembers(mongoId, ['m-1', 'm-2'])
if (jobId) await client.jobs.waitFor(jobId)

// Admin: publish-readiness dry-run (GET /processes/{id}/validation).
const { valid, errors } = await client.elections.validate(mongoId)

// Drafts: update(id, draft) PUTs the same shape as create and resolves void
// (re-get() for the stored shape; 409 once published). delete(id) removes it.
// signInfo(id, { authToken }) → { consumed: [{ questionId, nullifier, … }] },
// one entry per question the voter already cast.
// Legacy-only (single-election model, vochain ids): setStatus()/setStatusAndWait()
// (PUT /process/{id}/status) and getMetadata() — do not use with mongo process ids.

// Relay a vote (called internally by VotingClient — you rarely call this directly)
const { jobId } = await client.elections.vote({ txPayload })
```

---

## CensusClient (`client.census`) & OrganizationsClient (`client.organizations`)

The organizer-side surface used to set up an election before anyone votes. Only
relevant for admin/integrator flows (an API key with `managed:write` +
`members:write`); voter apps never touch these.

```ts
// Census: create an org-level CSP census, then publish it from a member group.
const { id: censusId } = await client.census.create({ orgAddress, authFields: ['memberNumber'] })
await client.census.publishGroup(censusId, groupId, { authFields: ['memberNumber'], weighted: false })

// Organizations: managed orgs, members, groups, and reads.
const org = await client.organizations.createManaged({ type: 'company', website })
const { jobId } = await client.organizations.addMembers(org.address, members) // async
await client.organizations.waitForMembersJob(org.address, jobId)
const { groups } = await client.organizations.listGroups(org.address)         // auto "All members" group
```

`OrganizationsClient` also covers groups CRUD, meta, api keys, subscription, and
list-reads (censuses/processes/drafts/jobs). See `packages/api-client/src/{census,organizations}.ts`
for the full set — the live `integration/full-flow.itest.ts` drives the whole flow end to end.

---

## JobsClient (`client.jobs`)

Async transaction outcomes — vote relays, publishes, status changes all return a `jobId`.

```ts
// One-shot status check
const job = await client.jobs.get(jobId)
// job.status  — 'pending' | 'completed' | 'failed'
// job.type    — 'relay_vote' | 'publish_process' | 'set_process_status' | ...
// job.result?.voteID — vote nullifier (relay_vote jobs)

// Poll until terminal state
const job = await client.jobs.waitFor(jobId, {
  intervalMs: 1000,        // default 1000
  timeoutMs: 60000,        // default 60000
  signal,                  // optional AbortSignal
  expectType: 'relay_vote', // optional: throw if the completed job.type differs
})
// throws JobFailedError if job.status === 'failed'
// throws Error on timeout, or on job.type mismatch when expectType is set
```

`JobFailedError` carries the full `JobStatusResponse` on `error.job`.

---

## AuthClient (`client.auth`)

The **normal SaaS user** auth flow: a signed-up user logs in with email/password
to get a JWT, then drives the SDK under their own organization (create processes,
etc.). This is distinct from the **integrator** flow (a `vsk_…` API key passed as
the client's `authToken`, used to manage orgs), and from the **voter** CSP flow
(`BundleClient`).

```ts
const session = await client.auth.login('user@example.com', 'secret')
// session.token   — JWT; feed it back as the client's Bearer to authenticate calls:
//                   new VocdoniApiClient({ apiUrl, authToken: () => session.token })
// session.expirity — expiry timestamp (the API's field spelling)

// Re-issue using the current token (no refresh token exists — the client must
// already be sending the JWT as Bearer).
const refreshed = await client.auth.refresh()

// Organizations the logged-in user belongs to:
const { addresses } = await client.auth.addresses()
```

---

## Key types from @vocdoni/api-types

```ts
import type { VotingProcessResponse, VotingProcessQuestion, BallotProtocol, Bundle } from '@vocdoni/api-types'

// Discriminated union on `published`: drafts may lack both dates; published
// processes always carry endDate (startDate backfill merged in saas-backend#586;
// processes published before it may still lack startDate). Narrow before reading dates.
type VotingProcessResponse = DraftVotingProcessResponse | PublishedVotingProcessResponse

interface VotingProcessBase {
  id: string                          // Mongo ObjectID (admin endpoints, getResults) — never 0x-hex
  orgAddress: string                  // owner org address, UNPREFIXED lowercase hex (other
                                      // endpoints return it 0x-prefixed — normalize to compare)
  title: MultiLangString              // { default, [lang]: string }
  description?: MultiLangString
  census: CensusSpec                  // { weighted?, authFields?, twoFaFields?, ... }
  questions: VotingProcessQuestion[]
}
interface DraftVotingProcessResponse extends VotingProcessBase {
  published: false
  startDate?: string
  endDate?: string
}
interface PublishedVotingProcessResponse extends VotingProcessBase {
  published: true
  startDate: string
  endDate: string
}

interface VotingProcessQuestion {
  id: string
  upstreamId?: string                 // on-chain vochain hex id (voting, bundle check/sign)
  title: MultiLangString
  choices: Choice[]                   // { title, value }
  ballotProtocol: BallotProtocol
  type: string                        // 'singlechoice' | 'multichoice' when created with a named
                                      // type; empty for raw-ballotProtocol questions
  typeSetup?: QuestionTypeSetup       // { minChoices, maxChoices, uniqueChoices }
  secretUntilTheEnd: boolean
  status: QuestionStatus              // 'UPCOMING' | 'ONGOING' | 'ENDED' | 'CANCELED' | 'PAUSED' | 'RESULTS' | 'PROCESS_UNKNOWN'
}

interface BallotProtocol {
  maxCount: number          // ballot length (number of fields)
  maxValue: number          // max value per field
  uniqueValues: boolean     // values must be unique (ranked voting)
  maxTotalCost: number
  maxVoteOverwrites: number
  costExponent: number
  costFromWeight: boolean
}

interface Bundle {
  id: string
  chainId?: string
  processes: string[]          // on-chain process ids
  census?: CensusInfo
}

interface CensusInfo {
  type?: string
  authFields?: string[]       // fields required at auth step 0
  twoFaFields?: string[]      // empty/absent → auth-only (no 2FA)
}
```

---

## Cross-references

- [[integrator-sdk]] — vote flow overview
- [[voting]] — `buildVoteTransaction`, `VotingClient`, choices format
- [[react]] — `ClientProvider` wraps `VocdoniApiClient` for React apps
