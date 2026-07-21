import { describe, it, expect } from 'vitest'
import { encodeBallot, encodeQuestionBallot } from './encode.js'
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

    it('throws when a single-choice question has no selection (no abstain concept)', () => {
      const election = createElection({ maxCount: 1, maxValue: 2 }, 2)
      const selections = [[], [1]] // First question empty — invalid, not an abstention
      expect(() => encodeBallot(election, selections)).toThrow(/exactly one choice/i)
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
    // 5 choices per question (values 0..4). maxValue === 4 means no abstain room;
    // maxValue >= 5 reserves abstain sentinels starting at 5.
    it('passes a full selection through when it already fills maxCount', () => {
      const election = createElection({ maxCount: 3, maxValue: 4 })
      const selections = [[0, 2, 4]] // Exactly maxCount picks
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([0, 2, 4])
    })

    it('pads unfilled slots with a repeated abstain sentinel (uniqueChoices === false)', () => {
      // maxValue 5 === choices.length reserves a single abstain value (5).
      const election = createElection({ maxCount: 3, maxValue: 5, uniqueChoices: false })
      expect(encodeBallot(election, [[1, 3]])).toEqual([1, 3, 5])
      expect(encodeBallot(election, [[]])).toEqual([5, 5, 5])
      expect(encodeBallot(election, [[0, 2, 4]])).toEqual([0, 2, 4])
    })

    it('pads unfilled slots with distinct ascending sentinels (uniqueChoices === true)', () => {
      // Unique choices need unique abstain values: 5, 6, 7, …
      const election = createElection({ maxCount: 3, maxValue: 7, uniqueChoices: true })
      expect(encodeBallot(election, [[1, 3]])).toEqual([1, 3, 5])
      expect(encodeBallot(election, [[1]])).toEqual([1, 5, 6])
      expect(encodeBallot(election, [[]])).toEqual([5, 6, 7])
    })

    it('throws when a partial selection cannot be padded (no abstain room)', () => {
      const election = createElection({ maxCount: 3, maxValue: 4 }) // maxValue === choices-1
      expect(() => encodeBallot(election, [[1, 3]])).toThrow(/does not reserve enough abstain/i)
      expect(() => encodeBallot(election, [[]])).toThrow(/does not reserve enough abstain/i)
    })

    it('throws for uniqueChoices when maxValue under-reserves the ascending sentinels', () => {
      // uniqueChoices needs maxValue >= numChoices - 1 + maxCount = 5 - 1 + 3 = 7.
      // maxValue 5 (>= numChoices) passed the old guard but would emit out-of-range
      // sentinels [_, 6, 7]; the tightened guard now rejects it.
      const election = createElection({ maxCount: 3, maxValue: 5, uniqueChoices: true })
      expect(() => encodeBallot(election, [[1]])).toThrow(/does not reserve enough abstain/i)
    })

    it('throws when there are more selections than maxCount', () => {
      const election = createElection({ maxCount: 2, maxValue: 4 })
      expect(() => encodeBallot(election, [[0, 1, 2]])).toThrow(/too many selections/i)
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

  describe('Flat vs nested selections', () => {
    // A flat number[] and its nested number[][] equivalent must encode identically.
    it('single-choice, single question: [2] === [[2]]', () => {
      const election = createElection({ maxCount: 1, maxValue: 2 })
      expect(encodeBallot(election, [2])).toEqual([2])
      expect(encodeBallot(election, [2])).toEqual(encodeBallot(election, [[2]]))
    })

    it('single-choice, multi-question: [0,2,4] === [[0],[2],[4]]', () => {
      const election = createElection({ maxCount: 1, maxValue: 2 }, 3)
      expect(encodeBallot(election, [0, 2, 4])).toEqual([0, 2, 4])
      expect(encodeBallot(election, [0, 2, 4])).toEqual(encodeBallot(election, [[0], [2], [4]]))
    })

    it('approval: [0,2] === [[0,2]]', () => {
      const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
      expect(encodeBallot(election, [0, 2])).toEqual([1, 0, 1, 0, 0])
      expect(encodeBallot(election, [0, 2])).toEqual(encodeBallot(election, [[0, 2]]))
    })

    it('multichoice: [1,3] === [[1,3]]', () => {
      const election = createElection({ maxCount: 3, maxValue: 5, uniqueChoices: false })
      expect(encodeBallot(election, [1, 3])).toEqual([1, 3, 5])
      expect(encodeBallot(election, [1, 3])).toEqual(encodeBallot(election, [[1, 3]]))
    })

    it('budget: [10,20,30,40,50] === [[10,20,30,40,50]]', () => {
      const election = createElection({ maxValue: 0, costExponent: 1 })
      expect(encodeBallot(election, [10, 20, 30, 40, 50])).toEqual([10, 20, 30, 40, 50])
      expect(encodeBallot(election, [10, 20, 30, 40, 50])).toEqual(
        encodeBallot(election, [[10, 20, 30, 40, 50]])
      )
    })

    it('an empty flat array is treated as no selection (approval → all zeros)', () => {
      const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
      expect(encodeBallot(election, [])).toEqual([0, 0, 0, 0, 0])
      expect(encodeBallot(election, [])).toEqual(encodeBallot(election, [[]]))
    })
  })
})

describe('encodeQuestionBallot', () => {
  const bp = (overrides: Record<string, number | boolean> = {}) => ({
    maxCount: 1,
    maxValue: 1,
    maxVoteOverwrites: 0,
    maxTotalCost: 0,
    costExponent: 1,
    uniqueValues: false,
    costFromWeight: false,
    ...overrides,
  })
  const choices = [
    { title: { default: 'A' }, value: 0 },
    { title: { default: 'B' }, value: 1 },
    { title: { default: 'C' }, value: 2 },
  ]

  describe('single-choice strictness', () => {
    it('encodes exactly one selection', () => {
      expect(encodeQuestionBallot({ ballotProtocol: bp(), choices }, [2])).toEqual([2])
    })

    it('throws on zero selections', () => {
      expect(() => encodeQuestionBallot({ ballotProtocol: bp(), choices }, [])).toThrow(
        /exactly one choice \(got 0\)/
      )
    })

    it('throws on more than one selection instead of silently dropping extras', () => {
      expect(() => encodeQuestionBallot({ ballotProtocol: bp(), choices }, [0, 2])).toThrow(
        /exactly one choice \(got 2\)/
      )
    })
  })

  it('throws for a multichoice named type without a ballotProtocol', () => {
    // Type-only questions can be classified but not encoded: the slot count and
    // abstain reservation live in the protocol.
    expect(() => encodeQuestionBallot({ type: 'multichoice', choices }, [0, 1])).toThrow(
      /no ballotProtocol/
    )
  })
})
