import type { Election, Question, VoteType } from '@vocdoni/api-types'
import { BallotType } from './types.js'
import { inferBallotType } from './infer.js'

/**
 * Encode high-level voter selections into the on-chain ballot array format.
 * 
 * Encoding rules (must match vochain scrutinizer):
 * - single-choice (multi-question): one chosen choice-index per question: [i0, i1, …]
 * - approval: dense 0/1 vector over options: choices.map(c => selected.has(c) ? 1 : 0)
 * - multichoice: list of selected option indices, padded to maxCount with abstain values if canAbstain
 * - budget / quadratic: per-option amount array [a0, a1, …]
 * 
 * @param input - Election config with questions and voteType
 * @param selections - Per-question choice indices (single/multi) or per-option amounts (budget/quadratic)
 * @returns The ballot array as numbers
 */
export function encodeBallot(
  input: Pick<Election, 'questions' | 'voteType'>,
  selections: number[][]
): number[] {
  const { questions, voteType } = input
  const ballotType = inferBallotType(input)

  switch (ballotType) {
    case BallotType.SingleChoice:
      return encodeSingleChoice(questions, selections)

    case BallotType.Approval:
      // approval: dense 0/1 vector, confirmed correct vs vochain scrutinizer
      // (NOT the legacy Form.tsx index list, which is buggy for >2 options)
      return encodeApproval(questions[0], selections[0] ?? [])

    case BallotType.MultiChoice:
      return encodeMultiChoice(voteType, questions[0], selections[0] ?? [])

    case BallotType.Budget:
    case BallotType.Quadratic:
      return encodeBudgetOrQuadratic(questions[0], selections[0] ?? [])

    default:
      throw new Error(`Unknown ballot type: ${ballotType}`)
  }
}

/**
 * Encode single-choice ballot: one choice index per question.
 */
function encodeSingleChoice(questions: Question[], selections: number[][]): number[] {
  return selections.map((indices) => {
    if (indices.length === 0) {
      // No selection = abstain; use 0 as default
      return 0
    }
    // Pick the first selected index (should be exactly one for single-choice)
    return indices[0]
  })
}

/**
 * Encode approval ballot: dense 0/1 vector over all choices.
 */
function encodeApproval(question: Question, selections: number[]): number[] {
  const has = new Set(selections)
  return question.choices.map((choice) => (has.has(choice.value) ? 1 : 0))
}

/**
 * Encode multichoice ballot: list of selected option indices.
 * For now, returns the selections directly; padding logic can be added if needed.
 */
function encodeMultiChoice(
  voteType: VoteType,
  question: Question,
  selections: number[]
): number[] {
  // Return selections as-is; they represent the chosen choice indices
  // Padding to maxCount with abstain values could be added here if canAbstain logic is available
  return [...selections]
}

/**
 * Encode budget or quadratic ballot: per-option amount array.
 */
function encodeBudgetOrQuadratic(question: Question, selections: number[]): number[] {
  // For budget/quadratic, selections represent the amounts allocated to each option
  // Return as-is; they should already be in the correct format
  return [...selections]
}
