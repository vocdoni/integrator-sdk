import type { BallotProtocol, Choice, Election, VoteType } from '@vocdoni/api-types'
import { BallotType } from './types.js'
import { inferBallotType, inferQuestionBallotType } from './infer.js'

/**
 * Lowest `maxValue` a multichoice election must reserve so that a partial selection
 * (fewer than `maxCount` picks) can be padded with abstain sentinel values.
 *
 * Mirrors the legacy `@vocdoni/sdk` reservation: repeatable ballots reuse a single
 * sentinel (`+1`); unique ballots need one distinct ascending sentinel per empty slot
 * (`+maxCount`).
 */
export function requiredAbstainMaxValue(
  numChoices: number,
  voteType: Pick<VoteType, 'maxCount' | 'uniqueChoices'>
): number {
  return numChoices - 1 + (voteType.uniqueChoices ? voteType.maxCount : 1)
}

/**
 * True when a multichoice election reserves enough values to encode abstain padding —
 * i.e. a voter may pick *fewer* than `maxCount` options and `encodeBallot` fills the
 * empty pick-slots with sentinels. Returns false for every non-multichoice ballot type
 * (single-choice/approval/budget/quadratic have no abstain padding).
 *
 * UIs use this to decide whether a partial multichoice selection is castable; the
 * encoder uses the same reservation formula internally.
 */
export function multichoiceReservesAbstain(input: Pick<Election, 'questions' | 'voteType'>): boolean {
  if (inferBallotType(input) !== BallotType.MultiChoice) return false
  const numChoices = input.questions[0]?.choices.length ?? 0
  return input.voteType.maxValue >= requiredAbstainMaxValue(numChoices, input.voteType)
}

/** True when a per-question multichoice ballot reserves abstain sentinels. */
export function questionReservesAbstain(question: { ballotProtocol?: BallotProtocol; choices: Choice[] }): boolean {
  if (inferQuestionBallotType(question) !== BallotType.MultiChoice) return false
  const bp = question.ballotProtocol
  if (!bp) return false
  const neededMaxValue = requiredAbstainMaxValue(question.choices.length, {
    maxCount: bp.maxCount,
    uniqueChoices: bp.uniqueValues,
  })
  return bp.maxValue >= neededMaxValue
}

/** Selection range for a per-question multichoice ballot. */
export function questionSelectionRange(question: {
  ballotProtocol?: BallotProtocol
  choices: Choice[]
}): { min: number; max: number } {
  const max = question.ballotProtocol?.maxCount ?? 1
  const min = questionReservesAbstain(question) ? 1 : max
  return { min, max }
}
