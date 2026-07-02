import { describe, it, expect } from 'vitest'
import { encodeBallot } from './encode.js'
import { BallotType } from './types.js'
import { inferBallotType } from './infer.js'
import type { Election } from '@vocdoni/api-types'

describe('encodeBallot', () => {
  const createElection = (voteType: Partial<Election['voteType']>, questions: number = 1): Pick<Election, 'questions' | 'voteType'> => ({
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
      description: { default: `Description ${i}` },
      choices: Array.from({ length: 5 }, (_, j) => ({
        title: { default: `Choice ${j}` },
        value: j,
      })),
    })),
  })

  describe('Single-choice encoding', () => {
    it('encodes single choice for single-question election', () => {
      const election = createElection({ maxCount: 1, maxValue: 2 })
      const selections = [[2]] // Select choice at index 2
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([2])
    })

    it('encodes single choice for multi-question election', () => {
      const election = createElection({ maxCount: 1, maxValue: 2 }, 3)
      const selections = [[0], [2], [4]] // Select different choices per question
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([0, 2, 4])
    })

    it('handles abstain (empty selection) as 0', () => {
      const election = createElection({ maxCount: 1, maxValue: 2 }, 2)
      const selections = [[], [1]] // First question abstain, second selects choice 1
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([0, 1])
    })

    it('picks first selection when multiple are provided (should not happen in practice)', () => {
      const election = createElection({ maxCount: 1, maxValue: 2 })
      const selections = [[1, 2]] // Invalid for single-choice, but encode should pick first
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([1])
    })
  })

  describe('Approval encoding (dense 0/1 vector)', () => {
    it('encodes approval as dense 0/1 vector', () => {
      const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
      const selections = [[0, 2]] // Select choices 0 and 2
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([1, 0, 1, 0, 0])
    })

    it('encodes empty approval selection as all zeros', () => {
      const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
      const selections = [[]]
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([0, 0, 0, 0, 0])
    })

    it('encodes full approval selection as all ones', () => {
      const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
      const selections = [[0, 1, 2, 3, 4]] // Select all choices
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([1, 1, 1, 1, 1])
    })

    it('handles non-contiguous selections', () => {
      const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
      const selections = [[1, 3]] // Select choices 1 and 3 only
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([0, 1, 0, 1, 0])
    })
  })

  describe('Multichoice encoding', () => {
    it('encodes multichoice as list of selected indices', () => {
      const election = createElection({ maxCount: 3, maxValue: 4 })
      const selections = [[1, 3]] // Select choices 1 and 3
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([1, 3])
    })

    it('encodes empty multichoice selection as empty array', () => {
      const election = createElection({ maxCount: 3, maxValue: 4 })
      const selections = [[]]
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([])
    })

    it('encodes full multichoice selection up to maxCount', () => {
      const election = createElection({ maxCount: 3, maxValue: 4 })
      const selections = [[0, 2, 4]] // Select 3 choices (maxCount)
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([0, 2, 4])
    })

    it('handles partial selection below maxCount', () => {
      const election = createElection({ maxCount: 5, maxValue: 10 })
      const selections = [[2]] // Select only 1 choice when maxCount is 5
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([2])
    })

    it('handles the 2-option edge case (maxValue === 1)', () => {
      // This is a documented ambiguity: 2-option multichoice can produce maxValue === 1
      // When uniqueChoices is false and maxValue === 1, it's treated as approval
      const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
      const selections = [[0]] // Select only choice 0
      const ballot = encodeBallot(election, selections)
      // Encoded as approval (dense 0/1 vector) with 5 choices total
      expect(ballot).toEqual([1, 0, 0, 0, 0])
    })
  })

  describe('Budget encoding', () => {
    it('encodes budget as per-option amounts', () => {
      const election = createElection({ maxValue: 0, costExponent: 1 })
      const selections = [[10, 20, 30, 40, 50]] // Allocate amounts to each option
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([10, 20, 30, 40, 50])
    })

    it('encodes zero budget for all options', () => {
      const election = createElection({ maxValue: 0, costExponent: 1 })
      const selections = [[0, 0, 0, 0, 0]]
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([0, 0, 0, 0, 0])
    })

    it('handles partial budget (should have one amount per choice)', () => {
      const election = createElection({ maxValue: 0, costExponent: 1 })
      const selections = [[10, 20]] // Only 2 amounts for 5 choices
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([10, 20])
    })
  })

  describe('Quadratic encoding', () => {
    it('encodes quadratic as per-option amounts (same format as budget)', () => {
      const election = createElection({ maxValue: 0, costExponent: 2 })
      const selections = [[5, 10, 15, 20, 25]] // Allocate quadratic weights to each option
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([5, 10, 15, 20, 25])
    })

    it('handles zero quadratic allocation', () => {
      const election = createElection({ maxValue: 0, costExponent: 2 })
      const selections = [[0, 0, 0]]
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([0, 0, 0])
    })
  })

  describe('Type inference consistency', () => {
    it('inferred type matches encoding behavior', () => {
      const election = createElection({ maxCount: 1, maxValue: 2 })
      const ballotType = inferBallotType(election)
      expect(ballotType).toBe(BallotType.SingleChoice)

      const selections = [[2]]
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([2])
    })

    it('approval inference matches dense 0/1 encoding', () => {
      const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
      const ballotType = inferBallotType(election)
      expect(ballotType).toBe(BallotType.Approval)

      const selections = [[0, 2]]
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([1, 0, 1, 0, 0]) // Dense 0/1 vector
    })
  })
})
