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
  electionId: processId,   // vochain id (election.address); omit for bundle-level check
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
// Fetch election by Mongo id — merges vochain data (address, chainId, encryptionPublicKeys)
const election = await client.elections.get(mongoId)
// election.id              — Mongo id (admin endpoints)
// election.address         — vochain hex id (voting, bundle check/sign)
// election.chainId         — Vochain chain id
// election.questions       — Question[]
// election.voteType        — { maxCount, maxValue, uniqueChoices, ... }
// election.electionType    — { secretUntilTheEnd, ... }
// election.encryptionPublicKeys — EncryptionKey[] | undefined

// List elections
const { elections, total } = await client.elections.list({ organizationId, page, pageSize, status })

// Get results
const results = await client.elections.getResults(mongoId)
// results.results    — string[][] (raw histogram matrix; see ballot protocol)
// results.voteCount
// results.status

// Admin: create a draft election → returns the draft id (Mongo hex string).
// Election text (title/description, question & choice titles) may be a plain
// string or a { default, <lang> } language map — plain strings are normalized
// to { default } for you.
const draftId = await client.elections.create({
  orgAddress,
  electionParams: {
    title: 'My election',
    questions: [
      { title: 'Approve?', choices: [{ title: 'No', value: 0 }, { title: 'Yes', value: 1 }] },
    ],
    voteType: { maxCount: 1, maxValue: 1 },
    electionType: { autostart: true, interruptible: true },
    maxCensusSize: 100,
    // endDate is required; omit startDate (with autostart) to start immediately.
    endDate: new Date(Date.now() + 2 * 3_600_000).toISOString(),
  },
})

// Admin: publish the draft on-chain. Async — returns { jobId } to poll (or
// { address, status } if already published). publishAndWait does the polling.
const published = await client.elections.publishAndWait(draftId)
// published.address — on-chain (vochain) process id

// Admin: lifecycle — also async (each returns { jobId }); *AndWait polls for you.
await client.elections.setStatusAndWait(mongoId, { status: 'paused' })   // pause
await client.elections.setStatusAndWait(mongoId, { status: 'ready' })    // resume
await client.elections.setStatusAndWait(mongoId, { status: 'ended' })    // end early
await client.elections.setStatusAndWait(mongoId, { status: 'canceled' }) // cancel
// Non-blocking variants returning the job: publish(), setStatus().
// Also: getMetadata(id), delete(id), signInfo(id, body).

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
// job.result?.voteID — vote nullifier (relay_vote jobs)

// Poll until terminal state
const job = await client.jobs.waitFor(jobId, {
  intervalMs: 1000,   // default 1000
  timeoutMs: 60000,   // default 60000
  signal,             // optional AbortSignal
})
// throws JobFailedError if job.status === 'failed'
// throws Error on timeout
```

`JobFailedError` carries the full `JobStatusResponse` on `error.job`.

---

## AuthClient (`client.auth`)

Admin / organization authentication (not the voter CSP flow — that's `BundleClient`).

```ts
const authToken = await client.auth.login(address, signature)
// authToken.token, authToken.refresh, authToken.expiresAt

const refreshed = await client.auth.refresh(refreshToken)
```

---

## Key types from @vocdoni/api-types

```ts
import type { Election, Bundle, VoteType, ElectionType, EncryptionKey } from '@vocdoni/api-types'

interface Election {
  id: string                          // Mongo id
  address: string                     // on-chain vochain hex id (use for voting)
  chainId?: string                    // Vochain chain id
  status: ElectionStatus              // 'READY' | 'PAUSED' | 'ENDED' | 'CANCELED' | 'UPCOMING'
  questions: Question[]
  voteType: VoteType
  electionType: ElectionType
  encryptionPublicKeys?: EncryptionKey[]
  results?: string[][]
  finalResults?: boolean
}

interface VoteType {
  maxCount: number          // ballot length (number of fields)
  maxValue: number          // max value per field
  uniqueChoices: boolean    // values must be unique (ranked voting)
  maxVoteOverwrites: number
  costExponent: number
}

interface ElectionType {
  secretUntilTheEnd: boolean
}

interface EncryptionKey {
  index: number   // key slot index
  key: string     // hex curve25519 public key
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

- [[app-sdk]] — vote flow overview
- [[voting]] — `buildVoteTransaction`, `VotingClient`, choices format
- [[react]] — `ClientProvider` wraps `VocdoniApiClient` for React apps
