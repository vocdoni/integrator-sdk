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
 *    - If voteType.maxValue === 1 → approval (dense 0/1 per option), regardless of uniqueChoices
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

  // Rule 3b: approval = dense 0/1 vector when maxValue === 1, regardless of uniqueChoices.
  // (Encoding confirmed correct vs the vochain scrutinizer — a dense 0/1 vector, NOT the
  // legacy Form.tsx index list, which is buggy for >2 options.)
  // A pick-slot layout needs maxValue >= numChoices - 1 to address every choice, so
  // maxValue === 1 can only ever be the dense layout. uniqueChoices does not change the
  // wire format — the scrutinizer applies it to raw field values, which makes it
  // unsatisfiable for dense multi-pick ballots. Switching layouts cannot route around
  // that, so the codec rejects such an election outright instead of encoding a ballot
  // that would be discarded at tally — see unsatisfiableProtocolReason.
  if (voteType.maxValue === 1) {
    return BallotType.Approval
  }

  // Rule 3c: Otherwise → multichoice
  return BallotType.MultiChoice
}

/**
 * Infer the ballot type for a single question from its `ballotProtocol`.
 * Mirrors the {@link inferBallotType} decision tree for the per-question model,
 * with one addition: a `maxValue === 1` protocol on a named `multichoice` question
 * keeps the MultiChoice label (the dense wire layout is selected by the codec via
 * {@link isDenseBallotProtocol}, not by the label).
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
  // maxValue === 1 is always the dense 0/1 wire layout (a pick-slot layout needs
  // maxValue >= numChoices - 1 to address every choice). The named `multichoice`
  // type keeps its semantic label — UIs badge it and cap picks as multichoice —
  // while the codec (encode/decode) selects the dense layout off the protocol
  // shape. Anything else maxValue === 1 is approval.
  if (bp.maxValue === 1) {
    return question.type === 'multichoice' ? BallotType.MultiChoice : BallotType.Approval
  }
  return BallotType.MultiChoice
}

/**
 * True when a question's protocol uses the dense 0/1 wire layout: one ballot field
 * per choice, each 0 or 1, with `maxTotalCost` bounding the number of picks. This is
 * what the backend derives for the named `multichoice` type, and what legacy approval
 * elections use. Pick-slot layouts need `maxValue >= numChoices - 1`, so
 * `maxValue === 1` (with more than one field) can only be dense.
 */
export function isDenseBallotProtocol(bp: Pick<BallotProtocol, 'maxCount' | 'maxValue'>): boolean {
  return bp.maxValue === 1 && bp.maxCount > 1
}
