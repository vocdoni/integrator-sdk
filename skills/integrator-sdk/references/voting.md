# Reference: @vocdoni/api-voting

The client-side cryptography and transaction-building layer. It knows nothing about HTTP — it produces a signed hex payload (`SignedTx`) that the api-client relays via `POST /vote`.

Install alongside api-client:

```bash
pnpm add @vocdoni/api-voting @vocdoni/api-client
```

---

## VotingClient

The high-level entry point. Inject a `VocdoniApiClient` (or any object that satisfies the `VoteApiClient` interface) at construction; call `vote()` to build, sign, and relay in one step.

```ts
import { VotingClient } from '@vocdoni/api-voting'
import { VocdoniApiClient } from '@vocdoni/api-client'

const client = new VocdoniApiClient({ apiUrl })
const voting = new VotingClient({ client })

const jobId = await voting.vote(options) // returns the async job id
const job   = await client.jobs.waitFor(jobId)
const nullifier = job.result?.voteID
```

`VoteApiClient` interface — only `elections.vote()` is required, so you can pass the full client or a slimmer adapter:

```ts
interface VoteApiClient {
  elections: { vote(req: RelayVoteRequest): Promise<RelayVoteResponse> }
}
```

---

## buildVoteTransaction

Lower-level function for when you want to relay the tx yourself or inspect the payload.

```ts
import { buildVoteTransaction } from '@vocdoni/api-voting'

const txPayload = buildVoteTransaction(options) // hex-encoded SignedTx
await client.elections.vote({ txPayload })
```

### BuildVoteTransactionOptions

| Field | Type | Required | Notes |
|---|---|---|---|
| `processId` | `string` | yes | On-chain (Vochain) hex id — `election.address`, not `election.id` |
| `choices` | `number[]` | yes | Raw on-chain ballot vector — build with `encodeBallot` from `@vocdoni/ballot`, see "Choices format" below |
| `chainId` | `string` | yes | From `bundle.chainId` or `election.chainId` |
| `signer` | `EphemeralSigner` | yes | Fresh per-vote ephemeral keypair |
| `cspSignature` | `string` | yes | Hex signature from `bundle.sign()` |
| `cspWeight` | `string` | no | Hex census weight from `bundle.sign()`; omit if absent |
| `encryptionKeys` | `EncryptionKey[]` | no | Required for `secretUntilTheEnd` elections — from `election.encryptionPublicKeys` |
| `proofType` | `ProofCA_Type` | no | Defaults to `ECDSA_PIDSALTED` (correct for all SaaS bundle elections) |

---

## EphemeralSigner

Generates a fresh secp256k1 keypair per vote. The CSP signs its Ethereum address; the signer then signs the Vochain transaction (EIP-191 `personal_sign`).

```ts
import { EphemeralSigner } from '@vocdoni/api-voting'

const signer = new EphemeralSigner()
signer.address    // '0x...' — pass to bundle.sign() as `payload`
signer.publicKey  // Uint8Array (65 bytes, uncompressed)
signer.privateKey // Uint8Array (32 bytes) — ephemeral, safe to discard after the vote
```

Never reuse a signer across votes. One `new EphemeralSigner()` per vote call.

---

## Choices format

`choices` is the raw on-chain ballot vector — it maps directly to the `votes` field of the vote package JSON. Its length must equal `election.voteType.maxCount` and each value must be in `[0, election.voteType.maxValue]`.

**Don't hand-build it — use `@vocdoni/ballot`.** The encoding differs per ballot type (approval is a dense 0/1 vector, multichoice pads unfilled slots with abstain sentinels), and `encodeBallot` derives the right vector from high-level selections:

```ts
import { inferBallotType, encodeBallot, decodeResults } from '@vocdoni/ballot'

const election = await client.elections.get(electionMongoId)

// What kind of ballot is this? Replaces the old-SDK `instanceof PublishedElection`.
inferBallotType(election) // 'single-choice' | 'multichoice' | 'approval' | 'budget' | 'quadratic'

// Encode high-level selections → the on-chain `choices` vector. `selections` is
// the chosen choice *values*: a flat number[] (`[2]` here). Nested number[][] (one
// array per question) is also accepted — handy for multi-question single-choice.
const choices = encodeBallot(election, [2]) // single-choice: pick the choice whose value is 2

await voting.vote({ processId: election.address!, chainId, choices, signer, cspSignature, cspWeight })
```

`selections` uses choice **values** (each choice's `value` field), not array positions — they usually coincide, but encode/decode are value-based throughout. A flat `number[]` is the ergonomic default; only single-choice is ever multi-question (one pick each), so nested `number[][]` is optional and mostly useful there.

### What encodeBallot produces (wire-format reference)

You rarely need this — it's what `encodeBallot` emits per type, and what the vochain scrutinizer expects (all four verified live in `integration/full-flow.itest.ts`):

| Ballot type | voteType | `selections` (flat) | `choices` output |
|---|---|---|---|
| single-choice | `maxCount 1` | `[2]` | `[2]` |
| single-choice, N questions | `maxCount 1`, N questions | `[1, 0, 2]` | `[1, 0, 2]` |
| approval | `maxCount = #choices`, `maxValue 1` | `[0, 2]` (approve values 0 & 2 of 3) | `[1, 0, 1]` (dense 0/1) |
| multichoice | `maxCount N`, `maxValue ≥ #choices` | `[1]` (1 pick of a 3-slot ballot) | `[1, s, s]` (empty slots = abstain sentinel) |
| budget / quadratic | `maxValue 0` | `[3, 0, 5]` (amount per option) | `[3, 0, 5]` |

Abstain is a **multichoice-only** concept: when a voter picks fewer than `maxCount` options, the empty slots are filled with sentinel values (`≥ #choices`) that the election reserves via `maxValue`. Single-choice has no abstain — an "Abstain" there is just another choice the creator added.

### Reading results back

`decodeResults(election)` turns the raw `election.results` histogram (`string[][]`) into per-question, per-choice tallies with percentages — and, for multichoice, a unified abstain bucket — so you never index the matrix positionally:

```ts
const decoded = decodeResults(election) // per question → [{ choice, votes, percentage }, …]
```

---

## Encrypted elections (secretUntilTheEnd)

Pass `encryptionPublicKeys` from the election object. `buildVoteTransaction` seals the ballot with NaCl SealedBox automatically; you don't call `BallotEncryptor` directly.

```ts
const election = await client.elections.get(electionMongoId)
// election.electionType.secretUntilTheEnd === true
// election.encryptionPublicKeys: Array<{ index: number; key: string }> — hex curve25519 public keys

const txPayload = buildVoteTransaction({
  processId: election.address,
  choices: [0],
  chainId: election.chainId!,
  signer,
  cspSignature: signature,
  cspWeight: weight,
  encryptionKeys: election.encryptionPublicKeys, // ← triggers NaCl sealing
})
```

When multiple keys are present they are applied in ascending `index` order (innermost first), matching how the Vochain unseals them.

> **Freshly published secret elections:** the keykeepers publish the encryption
> keys asynchronously, so `election.encryptionPublicKeys` can be empty for a few
> seconds right after publish. Poll `client.elections.get(mongoId)` until it is
> populated before building the vote (see `integration/full-flow.itest.ts`).

---

## BallotEncryptor (advanced)

Used internally by `buildVotePackage`. Exposed for testing:

```ts
import { BallotEncryptor } from '@vocdoni/api-voting'

const sealed = BallotEncryptor.seal(plaintext, hexCurve25519PublicKey)
// → Uint8Array: ephemeralPublicKey(32) || box

// open (test/debug only — requires the private key)
const opened = BallotEncryptor.open(sealed, recipientPk, recipientSk)
```

---

## Cross-references

- [[integrator-sdk]] — overview and vote flow sequence
- [[client]] — `BundleClient` (auth, check, sign), `JobsClient` (waitFor), `ElectionsClient` (vote relay)
- [[react]] — `useElection().vote()` automates this entire flow in React
