import type { Election, Question, VoteType } from '@vocdoni/api-types'
import { BallotType, type BallotSelections } from './types.js'
import { inferBallotType } from './infer.js'
import { normalizeSelections } from './selections.js'

/**
 * Validate voter selections against election constraints.
 *
 * `selections` accepts a flat `number[]` or a nested `number[][]`; both normalize to
 * the same per-question form — see {@link BallotSelections}.
 *
 * This function performs basic validation that can be done with ballot config alone.
 * It does NOT validate on-chain-only constraints (like minNumberOfChoices) which would
 * require additional metadata.
 *
 * @param input - Election config with questions and voteType
 * @param selections - The selections to validate
 * @throws Error if selections are invalid
 */
export function validateSelections(
  input: Pick<Election, 'questions' | 'voteType'>,
  selections: BallotSelections
): void {
  const { questions, voteType } = input
  const ballotType = inferBallotType(input)
  const perQuestion = normalizeSelections(input, selections)

  // Validate we have the right number of question arrays
  if (perQuestion.length !== questions.length) {
    throw new Error(
      `Selections count (${perQuestion.length}) does not match questions count (${questions.length})`
    )
  }

  switch (ballotType) {
    case BallotType.SingleChoice:
      validateSingleChoice(questions, perQuestion)
      break

    case BallotType.Approval:
      validateApproval(questions[0], perQuestion[0] ?? [])
      break

    case BallotType.MultiChoice:
      validateMultiChoice(voteType, questions[0], perQuestion[0] ?? [])
      break

    case BallotType.Budget:
    case BallotType.Quadratic:
      validateBudgetOrQuadratic(questions[0], perQuestion[0] ?? [])
      break

    default:
      throw new Error(`Unknown ballot type: ${ballotType}`)
  }
}

/**
 * Validate single-choice selections: exactly one choice per question, and that
 * choice must be a valid value of that question.
 *
 * Single-choice has no abstain concept — if abstaining is offered it is an explicit
 * choice placed by the process creator — so an empty selection is invalid input.
 */
function validateSingleChoice(questions: Question[], selections: number[][]): void {
  for (let q = 0; q < selections.length; q++) {
    const questionSelections = selections[q]

    if (questionSelections.length !== 1) {
      throw new Error(
        `Question ${q}: single-choice requires exactly 1 selection, got ${questionSelections.length}`
      )
    }

    const validValues = new Set(questions[q].choices.map((c) => c.value))
    const value = questionSelections[0]
    if (!validValues.has(value)) {
      throw new Error(
        `Question ${q}: invalid choice ${value}; must be one of [${Array.from(validValues).join(', ')}]`
      )
    }
  }
}

/**
 * Validate approval selections.
 */
function validateApproval(question: Question, selections: number[]): void {
  const validValues = new Set(question.choices.map((c) => c.value))

  for (const value of selections) {
    if (!validValues.has(value)) {
      throw new Error(
        `Invalid choice value ${value} for approval ballot; must be one of [${Array.from(validValues).join(', ')}]`
      )
    }
  }
}

/**
 * Validate multichoice selections.
 */
function validateMultiChoice(voteType: VoteType, question: Question, selections: number[]): void {
  const validValues = new Set(question.choices.map((c) => c.value))

  if (selections.length > voteType.maxCount) {
    throw new Error(
      `Question 0: multichoice allows at most ${voteType.maxCount} selections, got ${selections.length}`
    )
  }

  for (const value of selections) {
    if (!validValues.has(value)) {
      throw new Error(
        `Invalid choice value ${value} for multichoice ballot; must be one of [${Array.from(validValues).join(', ')}]`
      )
    }
  }
}

/**
 * Validate budget or quadratic selections.
 *
 * These selections are per-option *amounts* (not choice indices): one non-negative
 * integer per option, in choice order. The total-cost bounds (maxTotalCost /
 * costExponent) are not part of the on-chain voteType surface here, so only the
 * per-option shape is validated.
 */
function validateBudgetOrQuadratic(question: Question, selections: number[]): void {
  // Budget/quadratic require exactly one amount per option.
  if (selections.length !== question.choices.length) {
    throw new Error(
      `Question 0: budget/quadratic requires ${question.choices.length} amounts, got ${selections.length}`
    )
  }

  for (const amount of selections) {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error(
        `Invalid amount ${amount} for budget/quadratic ballot; amounts must be non-negative integers`
      )
    }
  }
}
