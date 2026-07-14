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
| `choices` | `number[]` | yes | Ballot values — see "Choices format" below |
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

`choices` maps directly to the `votes` field in the on-chain vote package JSON. The array length must equal `election.voteType.maxCount`; each value must be in `[0, election.voteType.maxValue]`.

The encoding pattern depends on how the election was created:

### Single question, pick one option (index format)

`maxCount = 1`, `maxValue = numOptions - 1`

The array has one element: the **0-based index** of the chosen option.

```ts
// 3 options: "Yes" (0), "No" (1), "Abstain" (2)
choices: [0]   // voted "Yes"
choices: [1]   // voted "No"
choices: [2]   // voted "Abstain"
```

This is the most common format and the one used by the integration tests.

### Single question, approve multiple options (binary format)

`maxCount = numOptions`, `maxValue = 1`

The array has one element per option: `1` = approved, `0` = not approved.

```ts
// 4 options; voter approves options 0 and 2
choices: [1, 0, 1, 0]
```

For approval elections that require exactly N approvals, `maxTotalCost = minTotalCost = N` enforces the count on-chain.

### Multiple questions, one choice per question

`maxCount = numQuestions`, `maxValue = maxOptionsPerQuestion - 1`

One element per question; each element is the chosen option index for that question.

```ts
// 3 questions, each with 4 options; voter picks option 2 on Q1, option 0 on Q2, option 3 on Q3
choices: [2, 0, 3]
```

### Ranked / rated (unique values)

`maxCount = numOptions`, `maxValue = maxRank`, `uniqueChoices = true`

Each option is ranked; values must not repeat.

```ts
// 3 candidates; ranked 1st, 3rd, 2nd (0-indexed)
choices: [0, 2, 1]
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
