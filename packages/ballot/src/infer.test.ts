import { describe, it, expect } from 'vitest'
import { inferBallotType, inferQuestionBallotType } from './infer'
import { BallotType } from './types'
import type { Election } from '@vocdoni/api-types'

describe('inferBallotType', () => {
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
      choices: Array.from({ length: 3 }, (_, j) => ({
        title: { default: `Choice ${j}` },
        value: j,
      })),
    })),
  })

  describe('Budget vs Quadratic (maxValue === 0)', () => {
    it('infers budget when costExponent === 1', () => {
      const election = createElection({ maxValue: 0, costExponent: 1 })
      expect(inferBallotType(election)).toBe(BallotType.Budget)
    })

    it('infers quadratic when costExponent === 2', () => {
      const election = createElection({ maxValue: 0, costExponent: 2 })
      expect(inferBallotType(election)).toBe(BallotType.Quadratic)
    })

    it('defaults to budget when costExponent is not 2 and maxValue === 0', () => {
      const election = createElection({ maxValue: 0, costExponent: 0 })
      expect(inferBallotType(election)).toBe(BallotType.Budget)
    })
  })

  describe('Multi-question elections', () => {
    it('infers single-choice for multi-question elections', () => {
      const election = createElection({}, 3)
      expect(inferBallotType(election)).toBe(BallotType.SingleChoice)
    })

    it('ignores voteType when questions.length > 1', () => {
      const election = createElection({ maxValue: 0, costExponent: 2 }, 5)
      expect(inferBallotType(election)).toBe(BallotType.SingleChoice)
    })
  })

  describe('Single-question elections', () => {
    describe('Single-choice (maxCount === 1)', () => {
      it('infers single-choice when maxCount === 1 and maxValue > 0', () => {
        const election = createElection({ maxCount: 1, maxValue: 2 })
        expect(inferBallotType(election)).toBe(BallotType.SingleChoice)
      })

      it('infers single-choice even with uniqueChoices === false', () => {
        const election = createElection({ maxCount: 1, maxValue: 1, uniqueChoices: false })
        expect(inferBallotType(election)).toBe(BallotType.SingleChoice)
      })
    })

    describe('Approval (maxValue === 1, uniqueChoices false)', () => {
      it('infers approval when maxValue === 1 and uniqueChoices === false', () => {
        const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
        expect(inferBallotType(election)).toBe(BallotType.Approval)
      })
    })

    describe('Multichoice (default)', () => {
      it('infers multichoice when maxCount > 1 and maxValue > 1', () => {
        const election = createElection({ maxCount: 3, maxValue: 4 })
        expect(inferBallotType(election)).toBe(BallotType.MultiChoice)
      })

      it('infers multichoice for pick-slot shapes regardless of uniqueChoices', () => {
        const election = createElection({ maxCount: 2, maxValue: 4, uniqueChoices: true })
        expect(inferBallotType(election)).toBe(BallotType.MultiChoice)
      })

      it('infers multichoice for a 2-option index-list (maxValue === 1, uniqueChoices true)', () => {
        // maxValue === 1 with uniqueChoices is a 2-option index-list (the only satisfiable
        // such shape is maxCount === 2 — pigeonhole); uniqueChoices is what separates it
        // from dense approval, which is always uniqueChoices: false.
        const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: true })
        expect(inferBallotType(election)).toBe(BallotType.MultiChoice)
      })
    })
  })

  describe('Edge cases', () => {
    it('handles empty questions array (should not happen in practice)', () => {
      const election = {
        voteType: {
          maxCount: 1,
          maxValue: 0,
          maxVoteOverwrites: 0,
          costExponent: 0,
          uniqueChoices: false,
          costFromWeight: false,
        },
        questions: [],
      } as Pick<Election, 'questions' | 'voteType'>
      
      // With no questions, it defaults to budget (maxValue === 0)
      expect(inferBallotType(election)).toBe(BallotType.Budget)
    })

    it('respects precedence: maxValue === 0 before single-choice check', () => {
      const election = createElection({ maxValue: 0, costExponent: 1, maxCount: 1 })
      expect(inferBallotType(election)).toBe(BallotType.Budget)
    })
  })
})

describe('inferQuestionBallotType', () => {
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

  it('infers from ballotProtocol when present (type is ignored)', () => {
    expect(inferQuestionBallotType({ ballotProtocol: bp() })).toBe(BallotType.SingleChoice)
    expect(inferQuestionBallotType({ ballotProtocol: bp({ maxCount: 2, maxValue: 3 }) })).toBe(
      BallotType.MultiChoice
    )
    // A protocol wins over a conflicting named type.
    expect(
      inferQuestionBallotType({ ballotProtocol: bp(), type: 'multichoice' })
    ).toBe(BallotType.SingleChoice)
  })

  describe('dense protocols (maxValue === 1, maxCount > 1, uniqueValues false)', () => {
    // The backend derives this shape for the named multichoice type: one 0/1 field per
    // choice, maxTotalCost bounding the picks. The named type keeps its semantic MultiChoice
    // label; anything else is approval. uniqueValues must be false here — dense + uniqueValues
    // is the unsatisfiable pigeonhole shape rejected at creation, and at maxValue === 1 a
    // uniqueValues protocol is instead a 2-option index-list (see the next describe).
    const dense = () => bp({ maxCount: 3, maxValue: 1, maxTotalCost: 2, uniqueValues: false })

    it('keeps the MultiChoice label for named multichoice questions', () => {
      expect(
        inferQuestionBallotType({ ballotProtocol: dense(), type: 'multichoice' })
      ).toBe(BallotType.MultiChoice)
    })

    it('infers approval for dense protocols without the multichoice type', () => {
      expect(inferQuestionBallotType({ ballotProtocol: dense() })).toBe(BallotType.Approval)
    })
  })

  describe('2-option index-list (maxValue === 1, uniqueValues true)', () => {
    // The only satisfiable maxValue === 1 && uniqueValues shape is maxCount === 2
    // (pigeonhole): two pick-slots holding values 0 and 1. It is an index-list multichoice
    // (wire-identical to a 2-option ranked ballot), so it takes the MultiChoice label even
    // with no named type — the backend empties the type label for shapes it cannot name.
    const twoOpt = () => bp({ maxCount: 2, maxValue: 1, uniqueValues: true })

    it('infers multichoice with or without the named type', () => {
      expect(inferQuestionBallotType({ ballotProtocol: twoOpt() })).toBe(BallotType.MultiChoice)
      expect(
        inferQuestionBallotType({ ballotProtocol: twoOpt(), type: 'multichoice' })
      ).toBe(BallotType.MultiChoice)
    })
  })

  it('falls back to the named type when ballotProtocol is missing', () => {
    expect(inferQuestionBallotType({ type: 'singlechoice' })).toBe(BallotType.SingleChoice)
    expect(inferQuestionBallotType({ type: 'multichoice' })).toBe(BallotType.MultiChoice)
  })

  it('throws when neither ballotProtocol nor a supported type is present', () => {
    expect(() => inferQuestionBallotType({})).toThrow(/cannot infer ballot type/)
    expect(() => inferQuestionBallotType({ type: 'singleChoice' })).toThrow(/cannot infer/)
    expect(() => inferQuestionBallotType({ type: 'approval' })).toThrow(/cannot infer/)
  })
})
