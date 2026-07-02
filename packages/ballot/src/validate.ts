import type { Election, Question, VoteType } from '@vocdoni/api-types'
import { BallotType } from './types.js'
import { inferBallotType } from './infer.js'

/**
 * Validate voter selections against election constraints.
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
  selections: number[][]
): void {
  const { questions, voteType } = input
  const ballotType = inferBallotType(input)

  // Validate we have the right number of question arrays
  if (selections.length !== questions.length) {
    throw new Error(
      `Selections count (${selections.length}) does not match questions count (${questions.length})`
    )
  }

  switch (ballotType) {
    case BallotType.SingleChoice:
      validateSingleChoice(voteType, selections)
      break

    case BallotType.Approval:
      validateApproval(questions[0], selections[0] ?? [])
      break

    case BallotType.MultiChoice:
      validateMultiChoice(voteType, questions[0], selections[0] ?? [])
      break

    case BallotType.Budget:
    case BallotType.Quadratic:
      validateBudgetOrQuadratic(questions[0], selections[0] ?? [])
      break

    default:
      throw new Error(`Unknown ballot type: ${ballotType}`)
  }
}

/**
 * Validate single-choice selections.
 */
function validateSingleChoice(voteType: VoteType, selections: number[][]): void {
  for (let q = 0; q < selections.length; q++) {
    const questionSelections = selections[q]

    // Allow empty selection (abstain) or exactly one choice
    if (questionSelections.length > 1) {
      throw new Error(
        `Question ${q}: single-choice allows at most 1 selection, got ${questionSelections.length}`
      )
    }

    // Validate the selected index is within range
    if (questionSelections.length === 1 && questionSelections[0] < 0) {
      throw new Error(`Question ${q}: invalid choice index ${questionSelections[0]} (must be >= 0)`)
    }
  }
}

/**
 * Validate approval selections.
 */
function validateApproval(question: Question, selections: number[]): void {
  const validIndices = new Set(question.choices.map((c) => c.value))

  for (const idx of selections) {
    if (!validIndices.has(idx)) {
      throw new Error(
        `Invalid choice index ${idx} for approval ballot; must be one of [${Array.from(validIndices).join(', ')}]`
      )
    }
  }
}

/**
 * Validate multichoice selections.
 */
function validateMultiChoice(voteType: VoteType, question: Question, selections: number[]): void {
  const validIndices = new Set(question.choices.map((c) => c.value))

  if (selections.length > voteType.maxCount) {
    throw new Error(
      `Question 0: multichoice allows at most ${voteType.maxCount} selections, got ${selections.length}`
    )
  }

  for (const idx of selections) {
    if (!validIndices.has(idx)) {
      throw new Error(
        `Invalid choice index ${idx} for multichoice ballot; must be one of [${Array.from(validIndices).join(', ')}]`
      )
    }
  }
}

/**
 * Validate budget or quadratic selections.
 */
function validateBudgetOrQuadratic(question: Question, selections: number[]): void {
  const validIndices = new Set(question.choices.map((c) => c.value))

  for (const idx of selections) {
    if (!validIndices.has(idx)) {
      throw new Error(
        `Invalid choice index ${idx} for budget/quadratic ballot; must be one of [${Array.from(validIndices).join(', ')}]`
      )
    }
  }

  // Budget/quadratic typically require all options to have an amount assigned
  if (selections.length !== question.choices.length) {
    throw new Error(
      `Question 0: budget/quadratic requires ${question.choices.length} amounts, got ${selections.length}`
    )
  }
}
