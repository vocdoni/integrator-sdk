import { describe, it, expect } from 'vitest'
import type { Election } from '@vocdoni/api-types'
import { multichoiceReservesAbstain } from './abstain.js'

const vt = (partial: Partial<Election['voteType']>): Election['voteType'] => ({
  maxCount: 1,
  maxValue: 0,
  maxVoteOverwrites: 0,
  costExponent: 0,
  uniqueChoices: false,
  costFromWeight: false,
  ...partial,
})

/** One question with `n` choices (values 0..n-1). */
const question = (n: number) => [
  {
    title: { default: 'Q0' },
    choices: Array.from({ length: n }, (_, j) => ({ title: { default: `C${j}` }, value: j })),
  },
]

describe('multichoiceReservesAbstain', () => {
  it('is false for non-multichoice ballots', () => {
    // single-choice
    expect(multichoiceReservesAbstain({ voteType: vt({ maxCount: 1, maxValue: 2 }), questions: question(3) })).toBe(false)
    // approval (maxValue 1, repeatable)
    expect(
      multichoiceReservesAbstain({ voteType: vt({ maxCount: 3, maxValue: 1, uniqueChoices: false }), questions: question(3) })
    ).toBe(false)
    // budget (maxValue 0)
    expect(multichoiceReservesAbstain({ voteType: vt({ maxCount: 3, maxValue: 0, costExponent: 1 }), questions: question(3) })).toBe(false)
  })

  it('repeatable multichoice: reserves abstain iff maxValue >= numChoices', () => {
    // numChoices 3, uniqueChoices false → needed = 3 - 1 + 1 = 3
    expect(multichoiceReservesAbstain({ voteType: vt({ maxCount: 3, maxValue: 3, uniqueChoices: false }), questions: question(3) })).toBe(true)
    expect(multichoiceReservesAbstain({ voteType: vt({ maxCount: 3, maxValue: 2, uniqueChoices: false }), questions: question(3) })).toBe(false)
  })

  it('unique multichoice: reserves abstain iff maxValue >= numChoices - 1 + maxCount', () => {
    // numChoices 3, uniqueChoices true, maxCount 3 → needed = 3 - 1 + 3 = 5
    expect(multichoiceReservesAbstain({ voteType: vt({ maxCount: 3, maxValue: 5, uniqueChoices: true }), questions: question(3) })).toBe(true)
    expect(multichoiceReservesAbstain({ voteType: vt({ maxCount: 3, maxValue: 4, uniqueChoices: true }), questions: question(3) })).toBe(false)
  })
})
