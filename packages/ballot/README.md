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

## Installation

```bash
pnpm add @vocdoni/ballot
```
