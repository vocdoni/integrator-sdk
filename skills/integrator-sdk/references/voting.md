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
| `processId` | `string` | yes | On-chain (Vochain) hex id for ONE question — `question.upstreamId` from `VotingProcessResponse.questions[i]`, not the process's Mongo `id` |
| `choices` | `number[]` | yes | Ballot values for that one question — see "Choices format" below |
| `chainId` | `string` | yes | From `election.chainId` (process read; legacy flows: `bundle.chainId`) — there is no per-question `chainId` |
| `signer` | `EphemeralSigner` | yes | Fresh per-vote ephemeral keypair |
| `cspSignature` | `string` | yes | Hex signature from `processes.sign()` (legacy flows: `bundle.sign()`) |
| `cspWeight` | `string` | no | Hex census weight from the same sign response; omit if absent |
| `encryptionKeys` | `EncryptionKey[]` | no | Required when `question.secretUntilTheEnd` is `true`; see "Encrypted elections" below for how keys are sourced |
| `proofType` | `ProofCA_Type` | no | Defaults to `ECDSA_PIDSALTED` (correct for all SaaS CSP processes) |

---

## EphemeralSigner

Generates a fresh secp256k1 keypair per vote. The CSP signs its Ethereum address; the signer then signs the Vochain transaction (EIP-191 `personal_sign`).

```ts
import { EphemeralSigner } from '@vocdoni/api-voting'

const signer = new EphemeralSigner()
signer.address    // '0x...' — pass to processes.sign() (or bundle.sign()) as `payload`
signer.publicKey  // Uint8Array (65 bytes, uncompressed)
signer.privateKey // Uint8Array (32 bytes) — ephemeral, safe to discard after the vote
```

Never reuse a signer across votes. One `new EphemeralSigner()` per vote call.

---

## Choices format

`buildVoteTransaction` builds ONE transaction for ONE question. `choices` maps
directly to the `votes` field in that question's on-chain vote package JSON.
The array length must equal `question.ballotProtocol.maxCount`; each value
must be in `[0, question.ballotProtocol.maxValue]`.

A multi-question process still casts one transaction per question — call
`buildVoteTransaction` (or `voting.vote`) once per entry in
`election.questions`, each with its own `processId` (`question.upstreamId`)
and `choices` array. There is no format where a single `choices` array spans
multiple questions.

The encoding pattern depends on the question's `ballotProtocol`:

### Single choice, pick one option (index format)

`ballotProtocol.maxCount = 1`, `ballotProtocol.maxValue = numOptions - 1`

The array has one element: the **0-based index** of the chosen option.

```ts
// 3 options: "Yes" (0), "No" (1), "Abstain" (2)
choices: [0]   // voted "Yes"
choices: [1]   // voted "No"
choices: [2]   // voted "Abstain"
```

This is the most common format and the one used by the integration tests.

### Approve multiple options (binary format)

`ballotProtocol.maxCount = numOptions`, `ballotProtocol.maxValue = 1`

The array has one element per option: `1` = approved, `0` = not approved.

```ts
// 4 options; voter approves options 0 and 2
choices: [1, 0, 1, 0]
```

For approval questions that cap the number of approvals, `ballotProtocol.maxTotalCost = N` enforces the count on-chain.

### Ranked / rated (unique values)

`ballotProtocol.maxCount = numOptions`, `ballotProtocol.maxValue = maxRank`,
`ballotProtocol.uniqueValues = true`

Each option is ranked; values must not repeat.

```ts
// 3 candidates; ranked 1st, 3rd, 2nd (0-indexed)
choices: [0, 2, 1]
```

Prefer `encodeQuestionBallot(question, selections)` from `@vocdoni/ballot`
over hand-building this array — it infers the ballot type from
`question.ballotProtocol` and handles multichoice abstain-padding for you
(see the recipes).

---

## Encrypted elections (secretUntilTheEnd)

Each question carries its own `secretUntilTheEnd: boolean`
(`VotingProcessQuestion.secretUntilTheEnd`). When `true`,
`buildVoteTransaction` seals the ballot with NaCl SealedBox automatically if
you pass `encryptionKeys`; you don't call `BallotEncryptor` directly.

```ts
const election = await client.elections.get(electionMongoId)
const question = election.questions[0]
// question.secretUntilTheEnd === true
// question.encryptionKeys — the keys; may be absent right after publish (see below)

const txPayload = buildVoteTransaction({
  processId: question.upstreamId!,
  choices: [0],
  chainId: election.chainId!,
  signer,
  cspSignature: signature,
  cspWeight: weight,
  encryptionKeys: question.encryptionKeys!, // ← triggers NaCl sealing; Array<{ index: number; key: string }>
})
```

When multiple keys are present they are applied in ascending `index` order (innermost first), matching how the Vochain unseals them.

> **Key sourcing:** `encryptionKeys` lives on the question — both on the process
> read (`elections.get(id).questions[i].encryptionKeys`) and on the public
> single-question read (`processes.getQuestion(id, qId).encryptionKeys`). The
> keykeepers publish keys asynchronously right after publish, and the field is
> **absent** (not an empty array) until then — treat absence as "not yet
> published" and poll before building the ballot. See
> `recipes/encrypted-vote.ts`.

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
- [[client]] — `ProcessesCspClient` (auth, check, sign — bundle-less), `BundleClient` (legacy), `JobsClient` (waitFor), `ElectionsClient` (vote relay)
- [[react]] — `useElection().vote()` automates this entire flow in React
