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
| `chainId` | `string` | yes | From `election.chainId` on the public process read (`client.elections.get` — published processes need no auth). There is no per-question `chainId`, and `client.info().chainId` is NOT a substitute (it's the service's current chain, not the process's) |
| `signer` | `EphemeralSigner` | yes | Fresh per-vote ephemeral keypair |
| `cspSignature` | `string` | yes | Hex signature from `processes.sign()` |
| `cspWeight` | `string` | no | Hex census weight from the same sign response; omit if absent |
| `encryptionKeys` | `EncryptionKey[]` | no | Required when `question.secretUntilTheEnd` is `true`; see "Encrypted elections" below for how keys are sourced |
| `proofType` | `ProofCA_Type` | no | Defaults to `ECDSA_PIDSALTED` (correct for all SaaS CSP processes) |
| `memo` | `string` | no | Free-text note attached to the vote (e.g. an open "Other" answer). Max 256 UTF-8 **bytes** (`MAX_MEMO_BYTES`, validated client-side; throws when over). ⚠️ Always cleartext on the envelope — never put sensitive text here, even on `secretUntilTheEnd` elections (only the vote package is encrypted) |

---

## EphemeralSigner

Generates a fresh secp256k1 keypair per vote. The CSP signs its Ethereum address; the signer then signs the Vochain transaction (EIP-191 `personal_sign`).

```ts
import { EphemeralSigner } from '@vocdoni/api-voting'

const signer = new EphemeralSigner()
signer.address    // '0x...' — pass to processes.sign() as `payload`
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

This is also the layout the backend derives for the named `multichoice`
question type (`maxTotalCost = typeSetup.maxChoices`). `maxValue = 1` always
means this binary format.

> ⚠️ **`uniqueValues` must be `false` on this layout.** It does not change the
> wire format — the scrutinizer applies it to the *raw field values*, and a 0/1
> vector over more than two options always repeats one of them (even a single
> pick, `[1, 0, 0, 0]`, repeats `0`). Every ballot is then discarded during
> aggregation: the election keeps counting `voteCount` while the tally stays all
> zeros. Uniqueness is already implicit here — each choice is its own field, so
> a voter *cannot* pick the same option twice.
>
> `client.elections.create/update` forces `typeSetup.uniqueChoices` to `false`
> for `type: 'multichoice'` and throws on an explicitly unsatisfiable
> `ballotProtocol`; `encodeQuestionBallot` refuses to encode a ballot for such a
> question rather than casting a vote that will never count. To check a question
> you did not create:
>
> ```ts
> import { unsatisfiableQuestionReason } from '@vocdoni/ballot'
>
> const reason = unsatisfiableQuestionReason(question)
> if (reason) console.error('this question can never be tallied:', reason)
> ```

### Ranked / rated (unique values)

`ballotProtocol.maxCount = numOptions`, `ballotProtocol.maxValue = maxRank`,
`ballotProtocol.uniqueValues = true`

Each option is ranked; values must not repeat. This is the one layout where
`uniqueValues` is satisfiable — `maxValue` has to leave at least `maxCount`
distinct values (`maxValue >= maxCount - 1`), or no ballot can fill the fields
without repeating one.

The array is one **rank per option, in choice order** — the field index is the
option, the value is its score. **Higher wins**: give your top pick
`numOptions - 1` and your last pick `0`. That orientation matters, because the
only shipped aggregation (see below) is index-weighted, so ranking with `0` as
"best" silently inverts the winner.

```ts
// 3 candidates, voter ranks C2 > C0 > C1.
// C0 -> 1 (middle), C1 -> 0 (last), C2 -> 2 (top)
choices: [1, 0, 2]
```

> ⚠️ **Ranked is only half-supported** — see
> [integrator-sdk#22](https://github.com/vocdoni/integrator-sdk/issues/22).
> `encodeQuestionBallot` passes the array through correctly and the chain
> tallies it, but `decodeQuestionResults` has **no ranked branch**: it labels the
> question `multichoice` and reports how many voters ranked each option (the same
> number for every option), plus a meaningless `abstain` bucket. The ranking is
> not recoverable through the SDK.
>
> The protocol alone cannot distinguish ranked from a pick-slot multichoice that
> fills every slot — they are byte-identical — which is why this needs an
> explicit signal rather than better inference.
>
> Until then, aggregate the raw matrix yourself. Borda, matching
> `saas-integrator-demo`:
>
> ```ts
> const scores = results.map((field) => field.reduce((sum, count, rank) => sum + Number(count) * rank, 0))
> ```
>
> Note `react-components` will render such a question as a checkbox group
> requiring exactly `numOptions` picks, not a rank widget.

### Budget / quadratic (per-option amounts)

`ballotProtocol.maxCount = numOptions`, `ballotProtocol.maxValue = 0`,
`costExponent = 1` (budget) or `2` (quadratic), `maxTotalCost` caps the spend.

The array has one element per option: the amount allocated to it, in choice
order.

```ts
// 4 options; voter allocates 4 to option 0 and 6 to option 2
choices: [4, 0, 6, 0]
```

`maxValue = 0` means "no upper bound per option" — and it also changes how the
**results** come back. The scrutinizer switches to discrete aggregation: each
option's row holds a single cell with `Σ amount × weight`, not a histogram.
`decodeQuestionResults` handles that; if you read the matrix by hand, take
`results[optionPosition][0]`.

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
// Public single-question read — no API key needed, so the voter app can call it.
// (chainId is not here — read it off the public process read, elections.get.)
const question = await client.processes.getQuestion(processMongoId, questionId)
// question.secretUntilTheEnd === true
// question.encryptionKeys — the keys; may be absent right after publish (see below)

const txPayload = buildVoteTransaction({
  processId: question.upstreamId!,
  choices: [0],
  chainId, // from the public process read — elections.get(processMongoId).chainId
  signer,
  cspSignature: signature,
  cspWeight: weight,
  encryptionKeys: question.encryptionKeys!, // ← triggers NaCl sealing; Array<{ index: number; key: string }>
})
```

When multiple keys are present they are applied in ascending `index` order (innermost first), matching how the Vochain unseals them.

> **Key sourcing:** `encryptionKeys` lives on the question — on the public
> process read (`elections.get(id).questions[i].encryptionKeys`) and the
> public single-question read
> (`processes.getQuestion(id, qId).encryptionKeys`); no auth for either. The
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
- [[client]] — `ProcessesCspClient` (auth, check, sign), `JobsClient` (waitFor), `ElectionsClient` (vote relay)
- [[react]] — `useElection().vote()` automates this entire flow in React
