import { describe, it, expect } from 'vitest'
import { inferBallotType } from './infer.js'
import { BallotType } from './types.js'
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

    describe('Approval (maxValue === 1 && !uniqueChoices)', () => {
      it('infers approval when maxValue === 1 and uniqueChoices === false', () => {
        const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
        expect(inferBallotType(election)).toBe(BallotType.Approval)
      })

      it('does not infer approval when uniqueChoices === true', () => {
        const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: true })
        expect(inferBallotType(election)).toBe(BallotType.MultiChoice)
      })
    })

    describe('Multichoice (default)', () => {
      it('infers multichoice when maxCount > 1 and maxValue > 1', () => {
        const election = createElection({ maxCount: 3, maxValue: 4 })
        expect(inferBallotType(election)).toBe(BallotType.MultiChoice)
      })

      it('infers multichoice when uniqueChoices === true and maxValue === 1', () => {
        const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: true })
        expect(inferBallotType(election)).toBe(BallotType.MultiChoice)
      })

      it('handles the 2-option edge case (maxValue === 1 collides with approval)', () => {
        // This is a documented ambiguity: 2-option multichoice can produce maxValue === 1
        const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
        expect(inferBallotType(election)).toBe(BallotType.Approval)
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
