# @vocdoni/ballot

Framework-agnostic Vocdoni ballot semantics: type inference, choice encoding, and results decoding.

## Purpose

This package provides pure functions for working with Vocdoni election ballots without any HTTP, React, or crypto dependencies. It is the lowest-level runtime package after `@vocdoni/api-types`.

## Public API

```typescript
// Election type names (runtime const + type)
export const BallotType: {
  SingleChoice: 'single-choice'
  MultiChoice: 'multichoice'
  Approval: 'approval'
  Budget: 'budget'
  Quadratic: 'quadratic'
}
export type BallotType = (typeof BallotType)[keyof typeof BallotType]

// Infer the ballot type from the declared type name, falling back to election config.
// `type` is the vochain `metadata.type.name` — see "Declared type names" below.
export function inferBallotType(
  input: Pick<Election, 'questions' | 'voteType'> & { type?: string }
): BallotType

// Encode high-level selections into the on-chain ballot array
export function encodeBallot(
  input: Pick<Election, 'questions' | 'voteType'> & { type?: string },
  selections: BallotSelections
): number[]

// Decode raw results into per-question/per-choice tallies
export function decodeResults(
  input: Pick<Election, 'questions' | 'voteType' | 'results'> & { type?: string }
): DecodedResults

// Validate selections against election constraints (optional)
export function validateSelections(
  input: Pick<Election, 'questions' | 'voteType'> & { type?: string },
  selections: BallotSelections
): void

// Whether a multichoice election reserves enough maxValue room to abstain-pad a
// partial selection (false for every other ballot type). Handy for UI validation.
export function multichoiceReservesAbstain(
  input: Pick<Election, 'questions' | 'voteType'> & { type?: string }
): boolean

// Why a ballot config admits no usable ballot, or null when it is fine.
// See "Unsatisfiable ballot configs" below.
export function unsatisfiableProtocolReason(bp: ProtocolBounds): string | null
export function unsatisfiableQuestionReason(question: {
  ballotProtocol?: BallotProtocol
  type?: string
  typeSetup?: QuestionTypeSetup
  choices: Choice[]
}): string | null
export function isUnsatisfiableProtocol(bp: ProtocolBounds): boolean
export function isUnsatisfiableQuestion(question: { /* as above */ }): boolean

// The part of a ballot protocol the satisfiability rule reads.
export type ProtocolBounds = Pick<BallotProtocol, 'maxCount' | 'maxValue' | 'uniqueValues'>

// Read the satisfiability bounds off an election-level voteType.
export function voteTypeBounds(
  voteType: Pick<VoteType, 'maxCount' | 'maxValue' | 'uniqueChoices'>
): ProtocolBounds

// True for the dense 0/1 wire layout (one field per choice) — what the backend
// derives for the named multichoice type.
export function isDenseBallotProtocol(bp: Pick<BallotProtocol, 'maxCount' | 'maxValue'>): boolean

// Assert an encoded wire ballot would survive the scrutinizer's per-field checks
// (range + uniqueness). The encoders run it on everything they produce; call it
// directly on a ballot built by hand. See "Unsatisfiable ballot configs" below.
export function assertEncodedBallot(ballot: number[], bounds: ProtocolBounds): void
```

## Usage

```typescript
import { inferBallotType, encodeBallot, decodeResults } from '@vocdoni/ballot'

// Infer the type from an election object
const type = inferBallotType({ questions, voteType })

// Encode voter selections into a ballot array. `selections` is the chosen choice
// values — a flat number[] (or nested number[][], one array per question):
const ballot = encodeBallot({ questions, voteType }, [2])       // single-choice → [2]
const approval = encodeBallot({ questions, voteType }, [0, 2])  // approval → [1,0,1,…]

// Decode results from the API response
const decoded = decodeResults({ questions, voteType, results })
```

## Declared type names

Protocol shape is a *reconstruction* of the election's intent, and at `maxValue === 1` the
reconstruction is lossy. A legacy `MultiChoiceElection` over two choices with repeatable
picks and no abstain allowance generates `{ maxCount: 2, maxValue: 1, uniqueChoices: false }`
— byte-identical to a two-option `ApprovalElection`. Nothing in the protocol separates them,
so reading the results by shape alone silently reports the wrong tally.

If the type is known, it is used. Two sources are consulted, in order, before shape:

```typescript
// 1. the explicit field — SaaS `question.type`, or an election-level override
const decoded = decodeQuestionResults({ ballotProtocol, type: 'multichoice', choices }, results)

// 2. the legacy metadata bag, for elections mapped over from @vocdoni/sdk
const decoded = decodeResults({
  questions, voteType, results,
  meta: { type: { name: 'multiple-choice' } },   // election-level bag
})
```

**The vocabulary follows the field it came from, not the function.** This matters because
the two name opposite wire layouts:

| source | recognized names | layout |
| --- | --- | --- |
| `type` (SaaS field) | `singlechoice`, `multichoice` | `multichoice` = **dense** 0/1 |
| `meta.type.name` / `metadata.type.name` (legacy bag) | `single-choice-multiquestion`, `multiple-choice`, `approval`, `budget-based`, `quadratic` | `multiple-choice` = **pick-slot** index list |

Reading a SaaS spelling as a legacy one would column-sum a dense matrix; the reverse
inverts a two-option tally. So a name is only ever resolved against its own table.

The legacy bag is read per question as well as per election, because in the SaaS model each
question *is* its own vochain process — a question mapped from a legacy election carries
that election's `metadata.type`.

An absent, empty or unrecognized name falls through to the shape rules unchanged. There is
no `ranked` entry in either table, so a ranked election still infers as multichoice (see
[#22](https://github.com/vocdoni/integrator-sdk/issues/22)).

## Encoding semantics

`encodeBallot` takes `selections` — the chosen choice values — and produces the on-chain
ballot the scrutinizer expects. `selections` accepts a flat `number[]` (the ergonomic
default) or a nested `number[][]` (one array per question); both normalize identically.
Only single-choice is ever multi-question, so a flat array is unambiguous:

| Type | `selections` (flat) | Ballot |
|---|---|---|
| single-choice | one chosen value per question `[v0, v1, …]` | one value per question `[v0, v1, …]` |
| approval | the approved choice values | dense `0/1` vector over every option |
| multichoice | the picked choice values | one value per pick-slot; unfilled slots padded with abstain sentinels when the protocol reserves them, otherwise a short ballot |
| budget / quadratic | the per-option amounts, in choice order | the amount array unchanged |

**Abstaining:**

- **single-choice** has **no abstain concept**. If abstaining is offered, the process creator
  adds an explicit "Abstain" option as a normal choice (e.g. `Yes=0, No=1, Abstain=2`), so the
  voter always picks exactly one value. An empty selection is invalid input and **throws** — in
  both `encodeBallot` and `validateSelections`.
- **multichoice** pads short selections up to `maxCount` with abstain sentinels — a single
  repeated value `choices.length` when `uniqueChoices` is `false`, or distinct ascending
  values `choices.length, choices.length + 1, …` when `uniqueChoices` is `true` — but only when
  the election reserves enough room (`maxValue >= choices.length - 1 + (uniqueChoices ?
  maxCount : 1)`). With no reserved room the ballot is sent **short**: the vochain enforces
  only the upper bound, and the legacy SDK sends short ballots unpadded. A minimum pick count
  is the UI's job (`typeSetup.minChoices`), not the encoder's. On the way back,
  `decodeResults` **unifies** all sentinel columns into a single trailing
  `{ choice: 'abstain', … }` bucket per multichoice question. That bucket is always present
  for multichoice; when the protocol reserves no headroom the matrix has no sentinel column
  at all, so it is structurally always `0` — call `questionReservesAbstain(question)` to
  decide whether an "Abstention" field is worth rendering.

## Decoding semantics

`decodeResults` / `decodeQuestionResults` read the raw on-chain matrix, whose layout
depends on the protocol:

| Type | Matrix | Per-choice tally |
|---|---|---|
| single-choice | one row per question, one column per choice value | `results[q][choiceValue]` |
| approval / dense multichoice | one row per option, `[notSelected, selected]` | `results[optionPos][1]` |
| pick-slot multichoice | one row per pick-slot, columns are choice values | column sum across rows; sentinel columns (`>= choices.length`) unify into one `abstain` bucket |
| budget / quadratic | one row per option, **one column** | `results[optionPos][0]` |

The decoder tells dense and pick-slot multichoice apart from the protocol, not a flag: dense
is `maxValue === 1 && !uniqueValues` (one 0/1 field per choice), pick-slot is every other
`maxCount > 1` multichoice (`uniqueValues: true`, or `maxValue >= 2`). A protocol-less named
`multichoice` question decodes dense.

The budget/quadratic row is a single cell because `maxValue === 0` switches the
scrutinizer to *discrete aggregation*: it accumulates `Σ amount × weight` into column
0 instead of bucketing a histogram (vocdoni-node `vochain/results/results.go` —
"The results are aggregated, so we use only the first column of the results matrix").
Reading such a row as a histogram yields zero for every option.

> **Ranked ballots are encodable but not decodable as a ranking** —
> [integrator-sdk#22](https://github.com/vocdoni/integrator-sdk/issues/22). A ranked
> protocol (`uniqueValues: true`, `maxValue >= maxCount - 1`) encodes correctly — pass
> one score per option in choice order, **higher wins** — but there is no ranked branch
> in the decoder: it is labelled `multichoice`, so `decodeResults` reports *how many
> voters ranked each option* (a ranked protocol reserves no sentinel headroom, so the
> `abstain` bucket is always `0`), not the resulting order.
>
> The protocol cannot be told apart from a pick-slot multichoice that fills every slot —
> the two are byte-identical, with field index meaning *option* in one and *slot* in the
> other — so this needs an explicit signal, not better inference. Until then, aggregate
> the raw matrix yourself:
> `results.map((f) => f.reduce((s, c, rank) => s + Number(c) * rank, 0))`.

## Unsatisfiable ballot configs

The vochain scrutinizer applies `uniqueValues` (`voteType.uniqueChoices`) to the **raw
field values** of a ballot, not to "the choices a voter picked": one repeated value and
the whole ballot is rejected during aggregation. The vote still counts towards
`voteCount`, so a broken election looks like a working one that nobody voted in.

Some configs can therefore never be tallied:

- **Dense `0/1` layout + `uniqueValues`** (`maxValue === 1`, `maxCount > 2`) — one field
  per choice means only the values `0` and `1` exist. Above two choices no ballot
  survives: even a single pick (`[1, 0, 0, 0]`) repeats `0`, so the tally is all zero.
  This is what the backend derives for a `multichoice` question created with
  `typeSetup.uniqueChoices: true`. At **exactly two** choices the config is *not*
  unsatisfiable — `[0, 1]` and `[1, 0]` pass. That shape (`maxValue === 1`,
  `uniqueValues: true`) is a 2-option index-list multichoice, wire-identical to a 2-option
  ranked ballot, so `unsatisfiableProtocolReason` deliberately returns `null` there (matching
  the backend) and the codec routes it as pick-slot. Individual ballots that repeat a value
  (e.g. abstaining as `[0, 0]`) are refused at **encode** time — see below.
- **Pigeonhole** (`uniqueValues`, `0 < maxValue + 1 < maxCount`) — fewer distinct legal
  values than fields to fill.

The scrutinizer's field checks also drop **individual ballots** whose config is fine:
a value above `maxValue`, or a repeated value under `uniqueValues` (duplicate ranks on
a ranked ballot, both picks of a two-field unique layout). Nothing downstream reports
those either — the envelope is accepted, `voteCount` rises, the ballot never counts.

So the guard runs at both levels: `encodeBallot` / `encodeQuestionBallot` /
`validateSelections` **throw** on an unsatisfiable *config* rather than producing a
ballot that will be discarded, and the encoders additionally run
`assertEncodedBallot` on every ballot they *produce*, refusing one the chain would
silently drop — a vote must either count or fail loudly, never mutate into silence.
`unsatisfiableProtocolReason` / `unsatisfiableQuestionReason` expose the config check
so a UI can detect an already-created broken question instead of rendering an empty
result chart. `unsatisfiableQuestionReason` also works on a public question read,
which omits the derived `ballotProtocol` — the contradiction is still visible in
`type` + `typeSetup`.

## Installation

```bash
pnpm add @vocdoni/ballot
```
