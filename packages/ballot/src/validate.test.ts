import { describe, it, expect } from 'vitest'
import type { Election } from '@vocdoni/api-types'
import { validateSelections } from './validate.js'

const createElection = (
  voteType: Partial<Election['voteType']>,
  questions: number = 1,
  choices: number = 5
): Pick<Election, 'questions' | 'voteType'> => ({
  voteType: {
    maxCount: 1,
    maxValue: 0,
    maxVoteOverwrites: 0,
    costExponent: 0,
    uniqueChoices: false,
    costFromWeight: false,
    ...voteType,
  },
  questions: Array.from({ length: questions }, (_, i) => ({
    title: { default: `Question ${i}` },
    choices: Array.from({ length: choices }, (_, j) => ({
      title: { default: `Choice ${j}` },
      value: j,
    })),
  })),
})

describe('validateSelections', () => {
  it('throws when the selections count does not match the questions count', () => {
    const election = createElection({ maxCount: 1, maxValue: 2 }, 2)
    expect(() => validateSelections(election, [[0]])).toThrow(/does not match questions count/i)
  })

  describe('single-choice', () => {
    it('accepts one valid choice per question', () => {
      const election = createElection({ maxCount: 1, maxValue: 2 }, 3)
      expect(() => validateSelections(election, [[0], [2], [4]])).not.toThrow()
    })

    it('rejects an empty selection (single-choice has no abstain concept)', () => {
      const election = createElection({ maxCount: 1, maxValue: 2 }, 2)
      expect(() => validateSelections(election, [[], [1]])).toThrow(/exactly 1 selection/i)
    })

    it('throws when more than one choice is selected', () => {
      const election = createElection({ maxCount: 1, maxValue: 2 })
      expect(() => validateSelections(election, [[0, 1]])).toThrow(/exactly 1 selection/i)
    })

    it('throws when the selected choice is out of range', () => {
      const election = createElection({ maxCount: 1, maxValue: 2 }, 1, 3)
      expect(() => validateSelections(election, [[5]])).toThrow(/invalid choice/i)
      expect(() => validateSelections(election, [[-1]])).toThrow(/invalid choice/i)
    })
  })

  describe('approval', () => {
    const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })

    it('accepts any subset of valid choices', () => {
      expect(() => validateSelections(election, [[0, 2, 4]])).not.toThrow()
      expect(() => validateSelections(election, [[]])).not.toThrow()
    })

    it('throws on an invalid choice', () => {
      expect(() => validateSelections(election, [[0, 9]])).toThrow(/invalid choice/i)
    })
  })

  describe('multichoice', () => {
    const election = createElection({ maxCount: 3, maxValue: 4 })

    it('accepts a valid selection within maxCount', () => {
      expect(() => validateSelections(election, [[0, 2]])).not.toThrow()
    })

    it('throws when more than maxCount choices are selected', () => {
      expect(() => validateSelections(election, [[0, 1, 2, 3]])).toThrow(/at most 3 selections/i)
    })

    it('throws on an invalid choice', () => {
      expect(() => validateSelections(election, [[0, 9]])).toThrow(/invalid choice/i)
    })
  })

  describe('budget / quadratic', () => {
    // Regression: amounts are NOT choice indices — a budget of 10 across 5 options
    // must validate even though 10 is not a valid choice index.
    it('accepts per-option amounts larger than the choice count', () => {
      const budget = createElection({ maxValue: 0, costExponent: 1 })
      expect(() => validateSelections(budget, [[10, 20, 30, 40, 50]])).not.toThrow()

      const quadratic = createElection({ maxValue: 0, costExponent: 2 })
      expect(() => validateSelections(quadratic, [[5, 10, 15, 20, 25]])).not.toThrow()
    })

    it('accepts an all-zero allocation', () => {
      const budget = createElection({ maxValue: 0, costExponent: 1 })
      expect(() => validateSelections(budget, [[0, 0, 0, 0, 0]])).not.toThrow()
    })

    it('throws when the amount count does not equal the option count', () => {
      const budget = createElection({ maxValue: 0, costExponent: 1 })
      expect(() => validateSelections(budget, [[10, 20]])).toThrow(/requires 5 amounts/i)
    })

    it('throws on a negative or non-integer amount', () => {
      const budget = createElection({ maxValue: 0, costExponent: 1 })
      expect(() => validateSelections(budget, [[10, -1, 0, 0, 0]])).toThrow(/non-negative integers/i)
      expect(() => validateSelections(budget, [[10, 1.5, 0, 0, 0]])).toThrow(/non-negative integers/i)
    })
  })

  describe('flat selections', () => {
    // A flat number[] normalizes to the same per-question form as its nested equivalent.
    it('accepts a flat single-choice, multi-question selection ([0,2,4])', () => {
      const election = createElection({ maxCount: 1, maxValue: 4 }, 3)
      expect(() => validateSelections(election, [0, 2, 4])).not.toThrow()
    })

    it('rejects a flat single-choice selection with the wrong question count', () => {
      const election = createElection({ maxCount: 1, maxValue: 4 }, 3)
      expect(() => validateSelections(election, [0, 2])).toThrow(/does not match questions count/i)
    })

    it('accepts a flat approval selection ([0,2])', () => {
      const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
      expect(() => validateSelections(election, [0, 2])).not.toThrow()
    })

    it('rejects an invalid choice in a flat approval selection', () => {
      const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
      expect(() => validateSelections(election, [0, 9])).toThrow(/invalid choice/i)
    })
  })
})
