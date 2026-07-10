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
```

## Usage

```typescript
import { inferBallotType, encodeBallot, decodeResults } from '@vocdoni/ballot'

// Infer the type from an election object
const type = inferBallotType({ questions, voteType })

// Encode voter selections into a ballot array
const ballot = encodeBallot({ questions, voteType }, selections)

// Decode results from the API response
const decoded = decodeResults({ questions, voteType, results })
```

## Encoding semantics

`encodeBallot` takes `selections` as one array per question and produces the on-chain
ballot the scrutinizer expects:

| Type | `selections[q]` | Ballot |
|---|---|---|
| single-choice | the chosen choice value (one entry) | one value per question `[v0, v1, …]` |
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

## Installation

```bash
pnpm add @vocdoni/ballot
```
