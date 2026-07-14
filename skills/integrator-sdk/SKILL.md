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

Every vote follows the same six steps regardless of election type:

```
1. GET /process/bundle/{bundleId}          → bundle info (chainId, census type)
2. POST /process/bundle/{bundleId}/auth/0  → auth step 0 (identify the voter)
   POST /process/bundle/{bundleId}/auth/1  → auth step 1 (confirm 2FA — skip if auth-only census)
3. POST /process/bundle/{bundleId}/check   → confirm membership + hasVoted
4. POST /process/bundle/{bundleId}/sign    → CSP signs the voter's ephemeral address
5. buildVoteTransaction(...)               → build + sign the protobuf tx locally
6. POST /vote                              → relay tx → jobId
   GET  /jobs/{jobId}                      → poll until completed → voteID (nullifier)
```

Steps 1–4 are handled by `@vocdoni/api-client` (`BundleClient`).
Steps 5–6 are handled by `@vocdoni/api-voting` (`VotingClient` or `buildVoteTransaction` directly).
In React, `BundleProvider` + `ElectionProvider` automate the entire flow.

## Quick-start (vanilla TS)

```ts
import { VocdoniApiClient } from '@vocdoni/api-client'
import { EphemeralSigner, VotingClient } from '@vocdoni/api-voting'

const client = new VocdoniApiClient({ apiUrl: 'https://saas-api.vocdoni.net' })
const voting = new VotingClient({ client })

// 1. Bundle info → chainId
const bundle = await client.bundle.get(bundleId)

// 2. Auth (auth-only census — no 2FA step)
const { authToken } = await client.bundle.authStep0(bundleId, { memberNumber: '42' })

// 3. Check membership
const { belongs, hasVoted } = await client.bundle.check(bundleId, { authToken, electionId: processId })
if (!belongs || hasVoted) throw new Error('Cannot vote')

// 4. CSP sign
const signer = new EphemeralSigner()
const { signature, weight } = await client.bundle.sign(bundleId, {
  authToken, electionId: processId, payload: signer.address,
})

// 5–6. Build tx, relay, poll for nullifier
const jobId = await voting.vote({
  processId, chainId: bundle.chainId!, choices: [0],
  signer, cspSignature: signature, cspWeight: weight,
})
const job = await client.jobs.waitFor(jobId)
console.log('nullifier:', job.result?.voteID)
```

## Mental model

- **Bundles group processes that share a census.** A voter authenticates once against the bundle and reuses the verified `authToken` to check and sign across every process in the bundle.
- **Two ids per election.** The SaaS API issues a Mongo `id` used by admin endpoints (create, update, results). The Vochain uses a hex `address`. Voting always uses `address`; bundle endpoints (check, sign) use `address` too. Read `references/client.md` for how `elections.get()` merges these.
- **The vote tx is signed by an ephemeral key, not the voter's wallet.** `EphemeralSigner` generates a fresh secp256k1 keypair per vote; the CSP signs its Ethereum address. This decouples the voter's identity from the on-chain signature.
- **Relaying is async.** `elections.vote()` returns a `jobId`. Poll `jobs.waitFor(jobId)` to get the vote nullifier (`voteID`). The `VotingClient.vote()` method returns the jobId; the React `useElection().vote()` awaits the full job.
- **Encrypted elections** (`secretUntilTheEnd`) need `encryptionPublicKeys` from the election object. Pass them to `buildVoteTransaction` — the ballot is NaCl-sealed automatically.

## A note on api-client stability

`@vocdoni/api-client` is actively evolving. Always read `references/client.md` for the current class/method names rather than recalling from training data.
