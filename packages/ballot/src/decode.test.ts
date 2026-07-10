import { describe, it, expect } from 'vitest'
import type { Election } from '@vocdoni/api-types'
import { decodeResults } from './decode.js'

const vt =(partial: Partial<Election['voteType']>): Election['voteType'] => ({
  maxCount: 1,
  maxValue: 0,
  maxVoteOverwrites: 0,
  costExponent: 0,
  uniqueChoices: false,
  costFromWeight: false,
  ...partial,
})

/** Build `n` questions with `choices` choices each (values 0..choices-1). */
const questions = (n: number, choices: number) =>
  Array.from({ length: n }, (_, i) => ({
    title: { default: `Q${i}` },
    choices: Array.from({ length: choices }, (_, j) => ({ title: { default: `C${j}` }, value: j })),
  }))

describe('decodeResults', () => {
  describe('single-choice', () => {
    it('single question: tally is the field histogram row directly', () => {
      // maxCount 1, one field = the question, value = chosen choice index.
      // 3 voters chose choices 0, 0, 1 out of three options.
      const decoded = decodeResults({
        voteType: vt({ maxCount: 1, maxValue: 2 }),
        questions: questions(1, 3),
        results: [['2', '1', '0']],
      })
      expect(decoded[0]).toEqual([
        { choice: 0, votes: 2, percentage: (2 / 3) * 100 },
        { choice: 1, votes: 1, percentage: (1 / 3) * 100 },
        { choice: 2, votes: 0, percentage: 0 },
      ])
    })

    it('multi-question: one histogram row per question (discrete-counting)', () => {
      // Ballot-protocol worked example: ballots [4,3,2], [4,2,3], [0,1,4].
      const decoded = decodeResults({
        voteType: vt({ maxCount: 3, maxValue: 4 }),
        questions: questions(3, 5),
        results: [
          ['1', '0', '0', '0', '2'], // Q0
          ['0', '1', '1', '1', '0'], // Q1
          ['0', '0', '1', '1', '1'], // Q2
        ],
      })
      expect(decoded.map((q) => q.map((c) => c.votes))).toEqual([
        [1, 0, 0, 0, 2],
        [0, 1, 1, 1, 0],
        [0, 0, 1, 1, 1],
      ])
      // percentages are per-question (Q0 total = 3)
      expect(decoded[0][4].percentage).toBeCloseTo((2 / 3) * 100, 6)
    })
  })

  describe('approval', () => {
    it('tally is the approve column (value 1) per option', () => {
      // Ballot-protocol worked example: results per option = [reject, approve].
      const decoded = decodeResults({
        voteType: vt({ maxCount: 5, maxValue: 1, uniqueChoices: false }),
        questions: questions(1, 5),
        results: [['1', '2'], ['0', '3'], ['0', '3'], ['2', '1'], ['3', '0']],
      })
      expect(decoded[0].map((c) => c.votes)).toEqual([2, 3, 3, 1, 0])
      // percentage is share of total approvals (9)
      expect(decoded[0][1].percentage).toBeCloseTo((3 / 9) * 100, 6)
    })
  })

  describe('multichoice', () => {
    it('tally is the column sum across pick-slot fields, plus a zero abstain bucket', () => {
      // 3 pick-slots (fields), each a histogram over the 5 choice values. No sentinel
      // columns present → the trailing abstain bucket is 0.
      const decoded = decodeResults({
        voteType: vt({ maxCount: 3, maxValue: 4 }),
        questions: questions(1, 5),
        results: [
          ['3', '0', '0', '0', '0'], // slot 0: choice 0 x3
          ['0', '2', '0', '1', '0'], // slot 1: choice 1 x2, choice 3 x1
          ['0', '0', '2', '0', '1'], // slot 2: choice 2 x2, choice 4 x1
        ],
      })
      expect(decoded[0].map((c) => c.votes)).toEqual([3, 2, 2, 1, 1, 0])
      expect(decoded[0].at(-1)).toMatchObject({ choice: 'abstain', votes: 0 })
    })

    it('unifies repeated abstain sentinel columns into a single bucket (uniqueChoices false)', () => {
      // numChoices = 3, so columns >= 3 are abstain sentinels (single column 3 here).
      const decoded = decodeResults({
        voteType: vt({ maxCount: 3, maxValue: 3, uniqueChoices: false }),
        questions: questions(1, 3),
        results: [
          ['1', '0', '0', '2'], // slot 0: choice 0 x1, abstain x2
          ['0', '1', '0', '2'], // slot 1: choice 1 x1, abstain x2
          ['0', '0', '1', '2'], // slot 2: choice 2 x1, abstain x2
        ],
      })
      expect(decoded[0]).toEqual([
        { choice: 0, votes: 1, percentage: (1 / 9) * 100 },
        { choice: 1, votes: 1, percentage: (1 / 9) * 100 },
        { choice: 2, votes: 1, percentage: (1 / 9) * 100 },
        { choice: 'abstain', votes: 6, percentage: (6 / 9) * 100 },
      ])
    })

    it('unifies ascending abstain sentinel columns into one bucket (uniqueChoices true)', () => {
      // numChoices = 3; unique sentinels spread across columns 3, 4, 5.
      const decoded = decodeResults({
        voteType: vt({ maxCount: 3, maxValue: 5, uniqueChoices: true }),
        questions: questions(1, 3),
        results: [
          ['2', '0', '0', '1', '0', '0'], // slot 0: choice 0 x2, sentinel 3 x1
          ['0', '2', '0', '0', '1', '0'], // slot 1: choice 1 x2, sentinel 4 x1
          ['0', '0', '2', '0', '0', '1'], // slot 2: choice 2 x2, sentinel 5 x1
        ],
      })
      expect(decoded[0].map((c) => [c.choice, c.votes])).toEqual([
        [0, 2],
        [1, 2],
        [2, 2],
        ['abstain', 3],
      ])
    })
  })

  describe('budget / quadratic', () => {
    it('tally is the index-weighted amount per option', () => {
      // Quadratic worked example: ballots [2,2,2,0], [1,1,2,2], [0,3,1,1] over 4 options.
      // Per-option histogram rows over allocated amounts.
      const decoded = decodeResults({
        voteType: vt({ maxCount: 4, maxValue: 0, costExponent: 2 }),
        questions: questions(1, 4),
        results: [
          ['1', '1', '1'], // opt0: amounts {0,1,2} once each → 0+1+2 = 3
          ['0', '1', '1', '1'], // opt1: {1,2,3} → 1+2+3 = 6
          ['0', '1', '2'], // opt2: {1}x1,{2}x2 → 1+4 = 5
          ['1', '1', '1'], // opt3: {0,1,2} → 0+1+2 = 3
        ],
      })
      expect(decoded[0].map((c) => c.votes)).toEqual([3, 6, 5, 3])
    })

    it('budget uses costExponent 1 but decodes the same index-weighted way', () => {
      const decoded = decodeResults({
        voteType: vt({ maxCount: 3, maxValue: 0, costExponent: 1 }),
        questions: questions(1, 3),
        results: [
          ['0', '0', '1'], // opt0: amount 2 once → 2
          ['0', '2'], // opt1: amount 1 twice → 2
          ['1'], // opt2: amount 0 once → 0
        ],
      })
      expect(decoded[0].map((c) => c.votes)).toEqual([2, 2, 0])
    })
  })

  describe('empty / missing results', () => {
    it('returns a uniform zero-filled shape (never throws, no bare [])', () => {
      // multichoice always carries a trailing abstain bucket, so its shape is choices + 1.
      const cases: Array<[Election['voteType'], number]> = [
        [vt({ maxCount: 1, maxValue: 2 }), 3], // single-choice
        [vt({ maxCount: 3, maxValue: 1, uniqueChoices: false }), 3], // approval
        [vt({ maxCount: 3, maxValue: 2 }), 4], // multichoice (3 choices + abstain)
        [vt({ maxCount: 3, maxValue: 0, costExponent: 1 }), 3], // budget
      ]
      for (const [voteType, expectedLength] of cases) {
        const decoded = decodeResults({ voteType, questions: questions(1, 3), results: [] })
        expect(decoded).toHaveLength(1)
        expect(decoded[0]).toHaveLength(expectedLength)
        expect(decoded[0].every((c) => c.votes === 0 && c.percentage === null)).toBe(true)
      }
    })

    it('undefined results decode to zeroes', () => {
      const decoded = decodeResults({
        voteType: vt({ maxCount: 1, maxValue: 2 }),
        questions: questions(2, 3),
        results: undefined,
      })
      expect(decoded).toHaveLength(2)
      expect(decoded.every((q) => q.every((c) => c.votes === 0))).toBe(true)
    })
  })
})
