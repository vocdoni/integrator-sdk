---
name: integrator-sdk
description: Use this skill whenever working with the Vocdoni Integrator SDK packages — @vocdoni/api-client, @vocdoni/api-voting, @vocdoni/react-providers, or @vocdoni/react-components. Triggers on imports from any of those packages, mentions of VocdoniApiClient, VotingClient, BundleProvider, ElectionProvider, CSP auth flow, vote relay, encrypted ballots (secretUntilTheEnd), or any task like "cast a vote", "set up voting in React", "build the vote transaction", "poll a job". The SDK talks exclusively to the Vocdoni SaaS API — no direct blockchain access.
---

# Vocdoni Integrator SDK

A monorepo of TypeScript packages that replaces the `@vocdoni/sdk` with a SaaS-first approach. Everything goes through the Vocdoni SaaS API; the SDK never talks to the blockchain directly.

## Packages at a glance

| Package | What it does |
|---|---|
| `@vocdoni/api-types` | Shared TypeScript interfaces — no runtime code |
| `@vocdoni/api-client` | HTTP client wrapping the SaaS REST API ⚠️ surface in flux |
| `@vocdoni/api-voting` | CSP auth, vote envelope, ballot encryption, vote-tx signing |
| `@vocdoni/api-voting-zk` | ZK/anonymous voting — phase 2, not stable yet |
| `@vocdoni/react-providers` | Headless React context providers and hooks |
| `@vocdoni/react-components` | Unstyled React UI components built on react-providers |

## Common task → reference

| User wants to… | Read first | Recipe |
|---|---|---|
| Understand the HTTP client, sub-clients, jobs | `references/client.md` | — |
| Cast a vote (low-level, no React) | `references/voting.md` | `recipes/single-choice-vote.ts` |
| Cast a multi-choice or approval vote | `references/voting.md` | `recipes/multichoice-vote.ts` |
| Cast a vote on an encrypted election | `references/voting.md` | `recipes/encrypted-vote.ts` |
| Set up the CSP auth flow manually | `references/client.md` + `references/voting.md` | `recipes/single-choice-vote.ts` |
| Add voting to a React app | `references/react.md` | — |
| Manage election lifecycle (pause/end/cancel) | `references/react.md` + `references/client.md` | — |
| ZK/anonymous voting | `references/zk-voting.md` | — |

## The vote flow in one minute

Every vote follows the same steps regardless of election type. All a voter app
needs is the process's Mongo id — no bundle:

```
1. GET  /processes/{id}                      → VotingProcessResponse (questions[], chainId, census auth config)
   GET  /processes/{id}/results              → VotingProcessResultsResponse (optional, for results view)
   GET  /processes/{id}/questions/{qId}      → public single-question read (choices, ballotProtocol, encryptionKeys)
2. POST /processes/{id}/auth/0               → auth step 0 (identify the voter)
   POST /processes/{id}/auth/1               → auth step 1 (confirm 2FA — skip if auth-only census)
3. POST /processes/{id}/check                → belongsToProcess + per-question canVote/hasVoted
   [repeat steps 4–6 for each votable question in questions[]]
4. POST /processes/{id}/sign                 → CSP signs voter's ephemeral address for question.upstreamId
5. buildVoteTransaction(...)                 → build + sign the protobuf tx locally
6. POST /vote                                → relay tx → jobId
   GET  /jobs/{jobId}                        → poll until completed → voteID (nullifier)
```

Steps 1–4 are handled by `@vocdoni/api-client` (`client.elections` for the reads,
`client.processes` — `ProcessesCspClient` — for the voter CSP routes).
Steps 5–6 are handled by `@vocdoni/api-voting` (`VotingClient` or `buildVoteTransaction` directly).
In React, `BundleProvider` + `ElectionProvider` automate the flow (still on the
legacy bundle routes — see below).

**Legacy bundle flow:** organizer-created bundles group processes sharing a
census; the same auth/check/sign steps live under `/process/bundle/{bundleId}/*`
and are wrapped by `BundleClient` (`client.bundle`). Use it only for existing
bundle deployments — the new `/processes` model needs no bundle.

## Quick-start (vanilla TS)

```ts
import { VocdoniApiClient } from '@vocdoni/api-client'
import { EphemeralSigner, VotingClient } from '@vocdoni/api-voting'

const client = new VocdoniApiClient({ apiUrl: 'https://saas-api.vocdoni.net' })
const voting = new VotingClient({ client })

// 1. Process read → questions (with their Vochain ids) + chainId
const election = await client.elections.get(processId) // Mongo id
const question = election.questions[0]

// 2. Auth (auth-only census — no 2FA step; else follow with authStep1)
const { authToken } = await client.processes.authStep0(processId, { memberNumber: '42' })

// 3. Check — per-question eligibility in one call
const { belongsToProcess, questions } = await client.processes.check(processId, { authToken })
const q = questions.find((s) => s.questionId === question.id)
if (!belongsToProcess || !q?.canVote || q.hasVoted) throw new Error('Cannot vote')

// 4. CSP sign — electionId is the QUESTION's on-chain id (upstreamId)
const signer = new EphemeralSigner()
const { signature, weight } = await client.processes.sign(processId, {
  authToken, electionId: question.upstreamId!, payload: signer.address,
})

// 5–6. Build tx, relay, poll for nullifier
const jobId = await voting.vote({
  processId: question.upstreamId!, chainId: election.chainId!, choices: [0],
  signer, cspSignature: signature, cspWeight: weight,
})
const job = await client.jobs.waitFor(jobId)
console.log('nullifier:', job.result?.voteID)
```

## Mental model

- **The voter's auth token is anchored to the process (new model).** `client.processes` authenticates the voter directly against the voting process; one verified `authToken` covers check/sign for every question. Bundles — organizer-created groups of processes sharing a census, authenticated via `client.bundle` — are the legacy equivalent and are not part of the new `/processes` model.
- **Admin vs voter surface.** `client.elections` is the ADMIN side of `/processes/{id}` (create, publish, census, status — API-key/JWT authed); `client.processes` is the VOTER side (auth/check/sign/weight — public, token-identified).
- **One process, many questions.** `GET /processes/{id}` returns a `VotingProcessResponse` with a `questions[]` array. Each question is a separate on-chain Vochain election (`question.upstreamId` is its Vochain hex id). Voting casts one Vochain transaction per question.
- **Process status is computed.** `computeProcessStatus(questions)` derives the top-level status from all question statuses. Any question `ONGOING` → `ONGOING`; all `ENDED`/`RESULTS` → `ENDED`. Statuses: `ONGOING`, `PAUSED`, `ENDED`, `CANCELED`, `UPCOMING`, `RESULTS`, `PROCESS_UNKNOWN`.
- **Ballot encoding is per-question.** Use `encodeQuestionBallot(question, answers)` from `@vocdoni/ballot` to produce each question's `number[]`, then pass `number[][]` to `vote()`.
- **The vote tx is signed by an ephemeral key, not the voter's wallet.** `EphemeralSigner` generates a fresh secp256k1 keypair per vote; the CSP signs its Ethereum address. This decouples the voter's identity from the on-chain signature.
- **Relaying is async.** `elections.vote()` returns a `jobId`. Poll `jobs.waitFor(jobId)` to get the vote nullifier (`voteID`). The `VotingClient.vote()` method returns the jobId; the React `useElection().vote()` awaits the full job for each question.

## A note on api-client stability

`@vocdoni/api-client` is actively evolving. Always read `references/client.md` for the current class/method names rather than recalling from training data.
