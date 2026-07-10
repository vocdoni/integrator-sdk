import type { Election, Question, VoteType } from '@vocdoni/api-types'
import { BallotType, type BallotSelections } from './types.js'
import { inferBallotType } from './infer.js'
import { normalizeSelections } from './selections.js'
import { requiredAbstainMaxValue } from './abstain.js'

/**
 * Encode high-level voter selections into the on-chain ballot array format.
 *
 * `selections` accepts a flat `number[]` (the ergonomic default) or a nested
 * `number[][]` (one array per question); both normalize to the same output — see
 * {@link BallotSelections}.
 *
 * Encoding rules (must match vochain scrutinizer):
 * - single-choice (multi-question): one chosen choice value per question: [v0, v1, …]
 * - approval: dense 0/1 vector over options: choices.map(c => selected.has(c) ? 1 : 0)
 * - multichoice: exactly `maxCount` picked option values, unfilled slots padded with abstain
 *   sentinels (values ≥ choices.length; see encodeMultiChoice)
 * - budget / quadratic: per-option amount array [a0, a1, …]
 *
 * @param input - Election config with questions and voteType
 * @param selections - Per-question choice values (single/multi) or per-option amounts (budget/quadratic)
 * @returns The ballot array as numbers
 */
export function encodeBallot(
  input: Pick<Election, 'questions' | 'voteType'>,
  selections: BallotSelections
): number[] {
  const { questions, voteType } = input
  const ballotType = inferBallotType(input)
  const perQuestion = normalizeSelections(input, selections)

  switch (ballotType) {
    case BallotType.SingleChoice:
      return encodeSingleChoice(questions, perQuestion)

    case BallotType.Approval:
      // approval: dense 0/1 vector, confirmed correct vs vochain scrutinizer
      // (NOT the legacy Form.tsx index list, which is buggy for >2 options)
      return encodeApproval(questions[0], perQuestion[0] ?? [])

    case BallotType.MultiChoice:
      return encodeMultiChoice(voteType, questions[0], perQuestion[0] ?? [])

    case BallotType.Budget:
    case BallotType.Quadratic:
      return encodeBudgetOrQuadratic(perQuestion[0] ?? [])

    default:
      throw new Error(`Unknown ballot type: ${ballotType}`)
  }
}

/**
 * Encode single-choice ballot: one choice value per question.
 *
 * Each question is a field whose value is the chosen choice. Single-choice has no
 * abstain concept: if abstaining is offered, the process creator adds an explicit
 * "Abstain" option as a normal choice, so the voter always picks exactly one value.
 * An empty selection is therefore invalid input, not an abstention.
 */
function encodeSingleChoice(questions: Question[], selections: number[][]): number[] {
  return selections.map((choices, q) => {
    if (choices.length === 0) {
      throw new Error(`Question ${q}: single-choice requires exactly one choice`)
    }
    // Pick the single selected value (validateSelections enforces exactly one)
    return choices[0]
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
 * Encode multichoice ballot: exactly `maxCount` picked option values.
 *
 * The scrutinizer expects a fixed `maxCount`-length ballot (one value per pick-slot),
 * so any selection shorter than `maxCount` must be padded with abstain sentinels. The
 * sentinels are the values just past the valid choice indices (`0..choices.length-1`);
 * the ballot config reserves them by setting `maxValue >= choices.length` (legacy SDK:
 * `maxValue = choices.length - 1 + abstainAllowance`):
 *
 * - `uniqueChoices === false` (choices may repeat): a single abstain value `choices.length`,
 *   reused for every empty slot.
 * - `uniqueChoices === true` (choices are unique): distinct ascending values
 *   `choices.length, choices.length + 1, …`, one per empty slot, so no value repeats.
 *
 * Throws when there are more selections than `maxCount`, or fewer than `maxCount` in an
 * election that does not reserve enough abstain values — in that case the voter must
 * pick exactly `maxCount` choices. "Enough" follows the legacy reservation formula
 * `maxValue = choices.length - 1 + (uniqueChoices ? maxCount : 1)`, which guarantees the
 * ascending unique sentinels never exceed `maxValue`.
 */
function encodeMultiChoice(voteType: VoteType, question: Question, selections: number[]): number[] {
  const numChoices = question.choices.length
  const { maxCount } = voteType
  const ballot = [...selections]

  if (ballot.length > maxCount) {
    throw new Error(
      `multichoice: too many selections (${ballot.length}); at most maxCount (${maxCount}) allowed`
    )
  }
  if (ballot.length === maxCount) return ballot

  // Fewer picks than slots: pad with abstain sentinels if the config reserves them.
  // Repeatable ballots reuse a single sentinel (+1); unique ballots need one distinct
  // ascending sentinel per slot (+maxCount) — matching the legacy maxValue reservation.
  const neededMaxValue = requiredAbstainMaxValue(numChoices, voteType)
  const abstainAllowed = voteType.maxValue >= neededMaxValue
  if (!abstainAllowed) {
    throw new Error(
      `multichoice: got ${ballot.length} selection(s) for a ${maxCount}-slot ballot, but this ` +
        `election does not reserve enough abstain values (maxValue ${voteType.maxValue} < ` +
        `${neededMaxValue}); select exactly ${maxCount} choices`
    )
  }

  const unique = voteType.uniqueChoices
  let abstainSlot = 0
  while (ballot.length < maxCount) {
    ballot.push(unique ? numChoices + abstainSlot : numChoices)
    abstainSlot++
  }
  return ballot
}

/**
 * Encode budget or quadratic ballot: per-option amount array, in choice order.
 */
function encodeBudgetOrQuadratic(selections: number[]): number[] {
  // For budget/quadratic, selections are the amounts allocated to each option; the
  // caller supplies them already in choice order, so pass them through unchanged.
  return [...selections]
}
