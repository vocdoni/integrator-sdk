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

> ⚠️ **Shape is a lossy reconstruction of intent — pass the declared type name when you
> have one.** At `maxValue = 1` two different wire layouts collapse onto identical
> numbers: a legacy two-option multichoice with repeatable picks and no abstain
> allowance generates `{maxCount: 2, maxValue: 1, uniqueValues: false}`, which is
> byte-identical to a two-option approval ballot. Nothing in the protocol separates
> them, so inferring by shape alone silently reports the wrong tally.
>
> Every `@vocdoni/ballot` entry point prefers a recognized declared type name over
> shape, and falls through to shape when the name is absent, empty or unrecognized.
> Two sources are consulted, and **the vocabulary follows the field, not the
> function** — each vocabulary names the opposite wire layout:
>
> | source | recognized names | layout meant |
> |---|---|---|
> | `type` — the SaaS `question.type` field | `singlechoice`, `multichoice` | `multichoice` = **dense** 0/1 |
> | `metadata.type.name` / `meta.type.name` — the legacy bag | `single-choice-multiquestion`, `multiple-choice`, `approval`, `budget-based`, `quadratic` | `multiple-choice` = **pick-slot** index list |
>
> ```ts
> // A question mapped over from a legacy @vocdoni/sdk election. In the SaaS model
> // each question is its own vochain process, so it carries that election's metadata.
> const decoded = decodeQuestionResults(
>   { ballotProtocol, metadata: { type: { name: 'multiple-choice' } }, choices },
>   results,
> )
> ```
>
> Reading a SaaS spelling as a legacy one would column-sum a dense matrix; the
> reverse inverts a two-option tally. Note that a legacy `multiple-choice` name also
> suppresses the dense remap in `decodeQuestionResults` / `encodeQuestionBallot` —
> at two options its protocol satisfies `isDenseBallotProtocol` too, so without the
> name the tally reads off the wrong axis. Neither list has a `ranked` entry — see
> the ranked section below.

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
question type (`maxTotalCost = typeSetup.maxChoices`). A `maxValue = 1` protocol
is this binary format **when `uniqueValues` is false** — the one with
`uniqueValues: true` is a 2-option index-list instead (see the next section).

> ⚠️ **`uniqueValues` must be `false` on the dense layout.** It does not change the
> wire format — the scrutinizer applies it to the *raw field values*, and a 0/1
> vector over more than two options always repeats one of them (even a single
> pick, `[1, 0, 0, 0]`, repeats `0`). Every ballot is then discarded during
> aggregation: the election keeps counting `voteCount` while the tally stays all
> zeros. Uniqueness is already implicit here — each choice is its own field, so
> a voter *cannot* pick the same option twice.
>
> `client.elections.create/update` rejects `typeSetup.uniqueChoices` on
> `type: 'multichoice'` (as the API itself does) and throws on an unsatisfiable
> `ballotProtocol`; `encodeQuestionBallot` refuses to encode a ballot for such a
> question rather than casting a vote that will never count. The encoders also
> check the ballot they *produce* (`assertEncodedBallot`): a field above
> `maxValue` or a repeated value under `uniqueValues` throws instead of casting a
> vote the chain accepts and never counts. To check a question you did not
> create:
>
> ```ts
> import { unsatisfiableQuestionReason } from '@vocdoni/ballot'
>
> const reason = unsatisfiableQuestionReason(question)
> if (reason) console.error('this question can never be tallied:', reason)
> ```

### Multichoice, pick up to N (index-list / pick-slot format)

`ballotProtocol.maxCount = maxPicks`, `ballotProtocol.maxValue >= numOptions - 1`,
`ballotProtocol.uniqueValues = true`, `ballotProtocol.maxTotalCost = 0`

One field per *pick-slot*, each holding the chosen option's value. This is the legacy
`@vocdoni/sdk` layout and what any raw `ballotProtocol` with `maxValue >= 2` (or the
2-option `maxValue: 1 && uniqueValues` shape) produces — the named `multichoice` type derives
the dense binary layout above instead.

```ts
// 4 options (values 0–3), maxPicks 4. Voter picks options 1 and 2 only.
choices: [1, 2]
```

Ballots may be **shorter than `maxCount`** — the vochain enforces only the upper bound.
`encodeQuestionBallot` pads unfilled slots with abstain sentinels when the protocol reserves
room for them, and returns the short ballot as-is otherwise. The reservation threshold depends
on whether values may repeat, because a unique ballot needs one *distinct* sentinel per empty
slot while a repeatable one reuses a single value:

```
uniqueValues: true   →  maxValue >= numOptions - 1 + maxCount
uniqueValues: false  →  maxValue >= numOptions - 1 + 1
```

(The field is `ballotProtocol.uniqueValues`; the election-level `voteType` spells the same flag
`uniqueChoices`. Most legacy pick-slot elections set it `true`, but `false` is valid here and
takes the lower threshold.) A minimum pick count is enforced by the UI
(`typeSetup.minChoices`), not the encoder. On decode, each option's tally is the **column
sum** across the pick-slots, plus a trailing `abstain` bucket — always present, but
structurally always `0` when the protocol reserves no sentinel headroom (the matrix has no
sentinel column to read). Use `questionReservesAbstain(question)` from `@vocdoni/ballot` to
decide whether to render an "Abstention" field. `<ElectionResults />` already applies this —
it drops the bucket only when the protocol reserves no headroom *and* the tally is 0, so a
headroom election still shows "Abstention: 0" (a real measurement) and a bucket holding real
votes is never hidden. The dense layout emits no bucket at all, so both layouts agree.

> ℹ️ This layout is wire-identical to a full-slate ranked ballot — see the ranked section.

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
SDK ships no ranked aggregation (see the caveat below) and the *manual* Borda
snippet it recommends is index-weighted, so ranking with `0` as "best" silently
inverts the winner. `encodeQuestionBallot` throws on a duplicate rank or a rank
above `maxValue` — either would make the chain drop the whole ballot at tally.

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
> number for every option), plus an `abstain` bucket that is always `0` — a ranked
> protocol reserves no sentinel headroom. The ranking is not recoverable through the SDK.
>
> The protocol alone cannot distinguish ranked from a pick-slot multichoice that
> fills every slot — they are byte-identical — which is why this needs an
> explicit signal rather than better inference. The declared-type-name override
> described under "Choices format" is that mechanism, but there is no `ranked`
> name in either vocabulary yet (`BallotType` has no member for it, and neither
> does the legacy `ElectionResultsTypeNames` enum), so a ranked question still
> falls through to the multichoice label.
>
> Until then, aggregate the raw matrix yourself. Borda, matching
> `saas-integrator-demo`:
>
> ```ts
> const scores = results.map((field) => field.reduce((sum, count, rank) => sum + Number(count) * rank, 0))
> ```
>
> Note `react-components` will render such a question as a checkbox group
> allowing up to `numOptions` picks (the minimum follows `typeSetup.minChoices`),
> not a rank widget.

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
