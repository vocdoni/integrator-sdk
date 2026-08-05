import type { BallotProtocol, Election } from '@vocdoni/api-types'
import { BallotType } from './types'

/**
 * Infer the ballot type from election configuration (questions + voteType).
 * 
 * Decision tree (precedence matters):
 * 1. If questions.length > 1 → single-choice (multi-question elections are always single-choice)
 * 2. Else if voteType.maxValue === 0 → budget (costExponent === 1) | quadratic (costExponent === 2)
 * 3. Else (single question):
 *    - If voteType.maxCount === 1 → single-choice (pick one of N)
 *    - If voteType.maxValue === 1 → approval (dense 0/1 per option) when !uniqueChoices,
 *      else multichoice (a 2-option index-list, the only satisfiable maxValue===1 &&
 *      uniqueChoices shape)
 *    - Otherwise → multichoice (maxValue = numChoices-1, list of picks)
 *
 * Assumptions:
 * - Approval/multichoice/budget/quadratic are single-question (questions.length === 1)
 * - Multi-question implies single-choice-per-question
 * - At maxValue === 1, uniqueChoices disambiguates dense approval from a 2-option index-list
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

  // Rule 3b: maxValue === 1 splits dense approval from a 2-option index-list on uniqueChoices.
  // !uniqueChoices → the dense 0/1 wire layout (approval): one field per choice, each 0/1.
  // uniqueChoices here can only be a 2-option index-list multichoice — it is the sole
  // satisfiable maxValue===1 && uniqueChoices shape (maxCount===2, pigeonhole; anything denser
  // is unsatisfiable and rejected at creation — see unsatisfiableProtocolReason). Its decode is
  // the pick-slot column sum, so it needs the MultiChoice label.
  // Load-bearing: the election-level decodeResults path has no dense remap, so its decode
  // routing depends entirely on this label.
  if (voteType.maxValue === 1) {
    return voteType.uniqueChoices ? BallotType.MultiChoice : BallotType.Approval
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
  if (bp.maxValue === 1) {
    // uniqueValues → a 2-option index-list (the only satisfiable maxValue===1 &&
    // uniqueValues shape is maxCount===2 — see isDenseBallotProtocol); it takes the
    // MultiChoice label even without a named type, since the backend empties the type
    // label for shapes it cannot name. Otherwise the dense layout applies: keep the
    // MultiChoice label for the named `multichoice` type, approval for anything else.
    if (bp.uniqueValues) return BallotType.MultiChoice
    return question.type === 'multichoice' ? BallotType.MultiChoice : BallotType.Approval
  }
  return BallotType.MultiChoice
}

/**
 * True when a question's protocol uses the dense 0/1 wire layout: one ballot field
 * per choice, each 0 or 1, with `maxTotalCost` bounding the number of picks. This is
 * what the backend derives for the named `multichoice` type, and what legacy approval
 * elections use.
 *
 * `maxValue === 1` alone is not enough: a 2-option index-list (pick-slot) multichoice also
 * has `maxValue === 1` (two choices ⇒ values 0/1) but carries `uniqueValues: true`. Dense is
 * `uniqueValues: false` — uniqueness is already implicit (a choice can't be picked twice), and
 * dense + uniqueValues is the unsatisfiable pigeonhole shape rejected at creation — so
 * `uniqueValues` is what separates the two at `maxValue === 1`.
 */
export function isDenseBallotProtocol(
  bp: Pick<BallotProtocol, 'maxCount' | 'maxValue' | 'uniqueValues'>,
): boolean {
  return bp.maxValue === 1 && bp.maxCount > 1 && !bp.uniqueValues
}
