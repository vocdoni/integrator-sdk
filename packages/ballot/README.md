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

// Infer the ballot type from election config
export function inferBallotType(
  input: Pick<Election, 'questions' | 'voteType'>
): BallotType

// Encode high-level selections into the on-chain ballot array
export function encodeBallot(
  input: Pick<Election, 'questions' | 'voteType'>,
  selections: BallotSelections
): number[]

// Decode raw results into per-question/per-choice tallies
export function decodeResults(
  input: Pick<Election, 'questions' | 'voteType' | 'results'>
): DecodedResults

// Validate selections against election constraints (optional)
export function validateSelections(
  input: Pick<Election, 'questions' | 'voteType'>,
  selections: BallotSelections
): void

// Whether a multichoice election reserves enough maxValue room to abstain-pad a
// partial selection (false for every other ballot type). Handy for UI validation.
export function multichoiceReservesAbstain(
  input: Pick<Election, 'questions' | 'voteType'>
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

## Encoding semantics

`encodeBallot` takes `selections` — the chosen choice values — and produces the on-chain
ballot the scrutinizer expects. `selections` accepts a flat `number[]` (the ergonomic
default) or a nested `number[][]` (one array per question); both normalize identically.
Only single-choice is ever multi-question, so a flat array is unambiguous:

| Type | `selections` (flat) | Ballot |
|---|---|---|
| single-choice | one chosen value per question `[v0, v1, …]` | one value per question `[v0, v1, …]` |
| approval | the approved choice values | dense `0/1` vector over every option |
| multichoice | the picked choice values | exactly `maxCount` values; unfilled slots padded with abstain sentinels |
| budget / quadratic | the per-option amounts, in choice order | the amount array unchanged |

**Abstaining:**

- **single-choice** has **no abstain concept**. If abstaining is offered, the process creator
  adds an explicit "Abstain" option as a normal choice (e.g. `Yes=0, No=1, Abstain=2`), so the
  voter always picks exactly one value. An empty selection is invalid input and **throws** — in
  both `encodeBallot` and `validateSelections`.
- **multichoice** pads short selections up to `maxCount` with abstain sentinels — a single
  repeated value `choices.length` when `uniqueChoices` is `false`, or distinct ascending
  values `choices.length, choices.length + 1, …` when `uniqueChoices` is `true`. This requires
  the election to reserve enough room (`maxValue >= choices.length - 1 + (uniqueChoices ?
  maxCount : 1)`); otherwise a partial selection throws and the voter must pick exactly
  `maxCount` choices. On the way back, `decodeResults` **unifies** all sentinel columns into a
  single trailing `{ choice: 'abstain', … }` bucket per multichoice question.

## Unsatisfiable ballot configs

The vochain scrutinizer applies `uniqueValues` (`voteType.uniqueChoices`) to the **raw
field values** of a ballot, not to "the choices a voter picked": one repeated value and
the whole ballot is rejected during aggregation. The vote still counts towards
`voteCount`, so a broken election looks like a working one that nobody voted in.

Some configs can therefore never be tallied:

- **Dense `0/1` layout + `uniqueValues`** (`maxValue === 1`, `maxCount > 1`) — one field
  per choice means only the values `0` and `1` exist, so any ballot over more than two
  fields repeats one. Even a single pick (`[1, 0, 0, 0]`) repeats `0`. This is what the
  backend derives for a `multichoice` question created with
  `typeSetup.uniqueChoices: true`.
- **Pigeonhole** (`uniqueValues`, `0 < maxValue + 1 < maxCount`) — fewer distinct legal
  values than fields to fill.

`encodeBallot` / `encodeQuestionBallot` / `validateSelections` **throw** on such a config
rather than producing a ballot that will be discarded, and
`unsatisfiableProtocolReason` / `unsatisfiableQuestionReason` expose the check so a UI can
detect an already-created broken question instead of rendering an empty result chart.
`unsatisfiableQuestionReason` also works on a public question read, which omits the
derived `ballotProtocol` — the contradiction is still visible in `type` + `typeSetup`.

## Installation

```bash
pnpm add @vocdoni/ballot
```
