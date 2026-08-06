import type { Election } from '@vocdoni/api-types'
import { BallotType, type BallotSelections } from './types'
import { inferBallotType } from './infer'

/**
 * Normalize the public {@link BallotSelections} (a flat `number[]` or a nested
 * `number[][]`) into the canonical per-question `number[][]` the encoders and
 * validators operate on.
 *
 * A nested value is used as-is. A flat value is interpreted by ballot type: only
 * single-choice is ever multi-question, so its flat form spreads one value per
 * question (`[1, 0, 2]` → `[[1], [0], [2]]`); every other type is single-question,
 * so the whole flat array is that one question's selection (`[0, 2]` → `[[0, 2]]`).
 */
export function normalizeSelections(
  input: Pick<Election, 'questions' | 'voteType'>,
  selections: BallotSelections
): number[][] {
  // Nested already — the first element is an array. (An empty array is treated as
  // the flat form, i.e. "no selection", which validation rejects where required.)
  if (selections.length > 0 && Array.isArray(selections[0])) {
    return selections as number[][]
  }

  const flat = selections as number[]
  return inferBallotType(input) === BallotType.SingleChoice
    ? flat.map((value) => [value])
    : [flat]
}
