import type { Election, Question, Choice, VoteType } from '@vocdoni/api-types'

/**
 * Runtime enum for ballot/election types. This is a runtime value (unlike the types-only
 * @vocdoni/api-types package), and is used to distinguish between different voting modes.
 */
export const BallotType = {
  SingleChoice: 'single-choice',
  MultiChoice: 'multichoice',
  Approval: 'approval',
  Budget: 'budget',
  Quadratic: 'quadratic',
} as const

/**
 * Type representing the ballot/election type. Derived from the runtime const above.
 */
export type BallotType = (typeof BallotType)[keyof typeof BallotType]

/**
 * High-level selections for a ballot, organized per question. Each question's selections
 * are represented as an array of choice indices that the voter has selected.
 * 
 * For single-choice: exactly one index per question (e.g., [2] means choice at index 2)
 * For multi-choice/approval: zero or more indices per question
 * For budget/quadratic: represents amounts allocated to each option (different encoding)
 */
export type BallotSelections = number[][]

/**
 * A decoded result entry for a single choice within a question.
 */
export interface DecodedChoiceResult {
  /** The index of the choice in the original question's choices array */
  choice: number
  /** The vote count/tally for this choice */
  votes: number
  /** The percentage of total votes (0-100), or null if not computable */
  percentage: number | null
}

/**
 * A decoded result entry for abstentions in a question.
 */
export interface DecodedAbstainResult {
  /** Always 'abstain' as the identifier */
  choice: 'abstain'
  /** The vote count/tally for abstentions */
  votes: number
  /** The percentage of total votes (0-100), or null if not computable */
  percentage: number | null
}

/**
 * Decoded results for a single question. Contains per-choice tallies and optional abstain count.
 */
export type DecodedQuestionResults = Array<DecodedChoiceResult | DecodedAbstainResult>

/**
 * Complete decoded results for all questions in an election.
 */
export type DecodedResults = DecodedQuestionResults[]
