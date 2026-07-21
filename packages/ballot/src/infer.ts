import type { BallotProtocol, Election } from '@vocdoni/api-types'
import { BallotType } from './types.js'

/**
 * Infer the ballot type from election configuration (questions + voteType).
 * 
 * Decision tree (precedence matters):
 * 1. If questions.length > 1 → single-choice (multi-question elections are always single-choice)
 * 2. Else if voteType.maxValue === 0 → budget (costExponent === 1) | quadratic (costExponent === 2)
 * 3. Else (single question):
 *    - If voteType.maxCount === 1 → single-choice (pick one of N)
 *    - If voteType.maxValue === 1 && !voteType.uniqueChoices → approval (dense 0/1 per option)
 *    - Otherwise → multichoice (maxValue = numChoices-1, list of picks)
 * 
 * Assumptions:
 * - Approval/multichoice/budget/quadratic are single-question (questions.length === 1)
 * - Multi-question implies single-choice-per-question
 * - 2-option multichoice can collide with approval (maxValue === 1); this is documented behavior
 * 
 * @param input - Election config with questions and voteType
 * @returns The inferred ballot type
 */
export function inferBallotType(input: Pick<Election, 'questions' | 'voteType'>): BallotType {
  const { questions, voteType } = input

  // Rule 1: Multiple questions → single-choice per question (highest precedence)
  if (questions.length > 1) {
    return BallotType.SingleChoice
  }

  // Rule 2: maxValue === 0 means budget or quadratic (costExponent distinguishes)
  if (voteType.maxValue === 0) {
    return voteType.costExponent === 2 ? BallotType.Quadratic : BallotType.Budget
  }

  // Single question - more specific rules
  // Rule 3a: maxCount === 1 means pick exactly one (single-choice)
  if (voteType.maxCount === 1) {
    return BallotType.SingleChoice
  }

  // Rule 3b: approval = dense 0/1 vector when maxValue === 1 and uniqueChoices is false.
  // (Encoding confirmed correct vs the vochain scrutinizer — a dense 0/1 vector, NOT the
  // legacy Form.tsx index list, which is buggy for >2 options.)
  if (voteType.maxValue === 1 && !voteType.uniqueChoices) {
    return BallotType.Approval
  }

  // Rule 3c: Otherwise → multichoice
  return BallotType.MultiChoice
}

/**
 * Infer the ballot type for a single question from its `ballotProtocol`.
 * Mirrors the {@link inferBallotType} decision tree for the per-question model.
 *
 * Backend reads always carry a `ballotProtocol` (it is derived from the named
 * type at creation), so the fallback path only applies to partial shapes
 * (e.g. `PublicQuestionResponse`): the named `type` is used when recognized,
 * and anything else throws rather than silently assuming single-choice.
 */
export function inferQuestionBallotType(question: {
  ballotProtocol?: BallotProtocol
  type?: string
}): BallotType {
  const bp = question.ballotProtocol
  if (!bp) {
    switch (question.type) {
      case 'singlechoice':
        return BallotType.SingleChoice
      case 'multichoice':
        return BallotType.MultiChoice
      default:
        throw new Error(
          'cannot infer ballot type: question has neither a ballotProtocol nor a supported type'
        )
    }
  }
  if (bp.maxValue === 0) {
    return bp.costExponent === 2 ? BallotType.Quadratic : BallotType.Budget
  }
  if (bp.maxCount === 1) return BallotType.SingleChoice
  if (bp.maxValue === 1 && !bp.uniqueValues) return BallotType.Approval
  return BallotType.MultiChoice
}
