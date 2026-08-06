import { describe, it, expect } from 'vitest'
import type { Election } from '@vocdoni/api-types'
import { decodeQuestionResults, decodeResults } from './decode'
import { questionReservesAbstain } from './abstain'

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

/** Build a single question whose choices carry the given (possibly non-contiguous) values. */
const questionWithValues = (values: number[]) => [
  {
    title: { default: 'Q0' },
    choices: values.map((v) => ({ title: { default: `C${v}` }, value: v })),
  },
]

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

    it('reads rows by option position, not choice value (non-contiguous values)', () => {
      // Fields are positional (choice-order dense 0/1 vector), so row index must be
      // the option position — NOT choice.value. Values 0,2,5 → rows 0,1,2.
      const decoded = decodeResults({
        voteType: vt({ maxCount: 3, maxValue: 1, uniqueChoices: false }),
        questions: questionWithValues([0, 2, 5]),
        results: [
          ['1', '2'], // position 0 (value 0): approve x2
          ['0', '3'], // position 1 (value 2): approve x3
          ['4', '1'], // position 2 (value 5): approve x1
        ],
      })
      expect(decoded[0].map((c) => [c.choice, c.votes])).toEqual([
        [0, 2],
        [2, 3],
        [5, 1],
      ])
    })
  })

  describe('multichoice', () => {
    it('tally is the column sum across pick-slot fields', () => {
      // 3 pick-slots (fields), each a histogram over the 5 choice values. No abstain
      // headroom (maxValue 4 < numChoices 5), so no sentinel column exists and the
      // always-emitted abstain bucket reports 0.
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
    // maxValue === 0 puts the scrutinizer in discrete-aggregation mode: it sums
    // `value * weight` into column 0 of each field's row and never widens the row
    // (results.go: "The results are aggregated, so we use only the first column").
    // These matrices are the shape a live vochain actually returns — verified
    // against saas-api-dev; an index-weighted read of them decodes to all zeros.
    it('tally is the single aggregated cell per option', () => {
      // Quadratic worked example: ballots [2,2,2,0], [1,1,2,2], [0,3,1,1] over 4
      // options → per-option sums 3, 6, 5, 3.
      const decoded = decodeResults({
        voteType: vt({ maxCount: 4, maxValue: 0, costExponent: 2 }),
        questions: questions(1, 4),
        results: [['3'], ['6'], ['5'], ['3']],
      })
      expect(decoded[0].map((c) => c.votes)).toEqual([3, 6, 5, 3])
    })

    it('budget uses costExponent 1 but decodes the same aggregated way', () => {
      const decoded = decodeResults({
        voteType: vt({ maxCount: 3, maxValue: 0, costExponent: 1 }),
        questions: questions(1, 3),
        results: [
          ['2'], // opt0: one voter allocated 2
          ['2'], // opt1: two voters allocated 1 each
          ['0'], // opt2: nothing allocated
        ],
      })
      expect(decoded[0].map((c) => c.votes)).toEqual([2, 2, 0])
    })

    it('reads rows by option position, not choice value (non-contiguous values)', () => {
      // Budget/quadratic fields are positional (amounts in choice order), so the row
      // index must be the option position — NOT choice.value. Values 0,4,9 → rows 0,1,2.
      const decoded = decodeResults({
        voteType: vt({ maxCount: 3, maxValue: 0, costExponent: 1 }),
        questions: questionWithValues([0, 4, 9]),
        results: [['2'], ['2'], ['0']],
      })
      expect(decoded[0].map((c) => [c.choice, c.votes])).toEqual([
        [0, 2],
        [4, 2],
        [9, 0],
      ])
    })

    it('weights are already applied on chain — the cell is the total, not a count', () => {
      // results.go worked example: ballots [1,2,3] w=10 and [0,3,1] w=5
      // → [[1*10+0*5], [2*10+3*5], [3*10+1*5]] = [[10],[35],[35]].
      const decoded = decodeResults({
        voteType: vt({ maxCount: 3, maxValue: 0, costExponent: 1 }),
        questions: questions(1, 3),
        results: [['10'], ['35'], ['35']],
      })
      expect(decoded[0].map((c) => c.votes)).toEqual([10, 35, 35])
    })
  })

  describe('empty / missing results', () => {
    it('returns a uniform zero-filled shape (never throws, no bare [])', () => {
      // multichoice always carries a trailing abstain bucket (0 without headroom).
      const cases: Array<[Election['voteType'], number]> = [
        [vt({ maxCount: 1, maxValue: 2 }), 3], // single-choice
        [vt({ maxCount: 3, maxValue: 1, uniqueChoices: false }), 3], // approval
        [vt({ maxCount: 3, maxValue: 2 }), 4], // multichoice, no headroom → choices + empty bucket
        [vt({ maxCount: 3, maxValue: 5 }), 4], // multichoice with abstain headroom → choices + 1
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

describe('decodeQuestionResults', () => {
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
  const choices = Array.from({ length: 3 }, (_, j) => ({ title: { default: `C${j}` }, value: j }))

  it('decodes a dense named-multichoice matrix per choice, not as pick-slots', () => {
    // Dense layout: one row per choice, [notSelected, selected]. 4 voters:
    // A picked by 1, B by 0, C by 2. The pick-slot decoder would instead sum
    // histogram columns by choice value and invent an abstain bucket.
    const dense = bp({ maxCount: 3, maxValue: 1, maxTotalCost: 2, uniqueValues: false })
    const decoded = decodeQuestionResults(
      { ballotProtocol: dense, type: 'multichoice', choices },
      [
        ['3', '1'],
        ['4', '0'],
        ['2', '2'],
      ]
    )
    expect(decoded).toEqual([
      { choice: 0, votes: 1, percentage: (1 / 3) * 100 },
      { choice: 1, votes: 0, percentage: 0 },
      { choice: 2, votes: 2, percentage: (2 / 3) * 100 },
    ])
  })

  it('decodes a protocol-less named multichoice question as dense', () => {
    // Public reads of named-type questions may omit the derived protocol —
    // the named type still implies the dense per-choice layout.
    const decoded = decodeQuestionResults({ type: 'multichoice', choices }, [
      ['3', '1'],
      ['4', '0'],
      ['2', '2'],
    ])
    expect(decoded.map((c) => c.votes)).toEqual([1, 0, 2])
  })

  it('still decodes pick-slot protocols by choice-value columns', () => {
    // Legacy pick-slot: 2 slots over 3 choices, abstain sentinels at values >= 3.
    const pickSlot = bp({ maxCount: 2, maxValue: 4, maxTotalCost: 0, uniqueValues: true })
    const decoded = decodeQuestionResults(
      { ballotProtocol: pickSlot, type: 'multichoice', choices },
      [
        ['2', '0', '1', '0', '0'],
        ['0', '1', '1', '1', '0'],
      ]
    )
    expect(decoded).toEqual([
      { choice: 0, votes: 2, percentage: (2 / 6) * 100 },
      { choice: 1, votes: 1, percentage: (1 / 6) * 100 },
      { choice: 2, votes: 2, percentage: (2 / 6) * 100 },
      { choice: 'abstain', votes: 1, percentage: (1 / 6) * 100 },
    ])
  })

  it('decodes a real index-list election by column sum', () => {
    // Live dev election 6a7316275fe6ad98c8c97a3c: 4 choices, maxCount 4, maxValue 3
    // (=== numChoices-1, no abstain headroom). Ballots [0,1,2,3] and a short [1,2] produce
    // this histogram; the column sum tallies each choice value across the 4 pick-slots.
    const four = Array.from({ length: 4 }, (_, j) => ({ title: { default: `C${j}` }, value: j }))
    const indexList = bp({
      maxCount: 4,
      maxValue: 3,
      maxTotalCost: 0,
      costExponent: 1,
      uniqueValues: true,
      maxVoteOverwrites: 0,
      costFromWeight: false,
    })
    const decoded = decodeQuestionResults(
      { ballotProtocol: indexList, choices: four },
      [
        ['1', '1', '0', '0'],
        ['0', '1', '1', '0'],
        ['0', '0', '1', '0'],
        ['0', '0', '0', '1'],
      ]
    )
    expect(decoded.map((c) => c.votes)).toEqual([1, 2, 2, 1, 0])
    // No sentinel column exists in the matrix (maxValue 3 === numChoices-1), so the
    // always-emitted bucket is 0. `questionReservesAbstain` is what tells a UI to hide it.
    expect(decoded.at(-1)).toMatchObject({ choice: 'abstain', votes: 0 })
    expect(questionReservesAbstain({ ballotProtocol: indexList, choices: four })).toBe(false)
  })

  it('decodes a dense 4-choice matrix by the selected column', () => {
    // Dense layout: one [notSelected, selected] row per choice. 4 voters across 4 choices.
    const four = Array.from({ length: 4 }, (_, j) => ({ title: { default: `C${j}` }, value: j }))
    const dense = bp({ maxCount: 4, maxValue: 1, maxTotalCost: 4, uniqueValues: false })
    const decoded = decodeQuestionResults(
      { ballotProtocol: dense, type: 'multichoice', choices: four },
      [
        ['1', '3'],
        ['0', '4'],
        ['0', '4'],
        ['1', '3'],
      ]
    )
    expect(decoded.map((c) => c.votes)).toEqual([3, 4, 4, 3])
    expect(decoded.find((c) => c.choice === 'abstain')).toBeUndefined()
  })

  it('always emits an abstain bucket; headroom is what makes it meaningful', () => {
    // Headroom (maxValue 7 >= numChoices-1+maxCount = 5): the sentinel columns exist in the
    // matrix, so a 0 here means "nobody abstained" — worth rendering.
    const headroom = bp({ maxCount: 3, maxValue: 7, uniqueValues: true })
    const withHeadroom = decodeQuestionResults(
      { ballotProtocol: headroom, choices },
      [
        ['1', '0', '0', '0', '0', '0', '0'],
        ['0', '1', '0', '0', '0', '0', '0'],
        ['0', '0', '1', '0', '0', '0', '0'],
      ]
    )
    expect(withHeadroom.at(-1)).toMatchObject({ choice: 'abstain', votes: 0 })
    expect(questionReservesAbstain({ ballotProtocol: headroom, choices })).toBe(true)

    // No headroom (maxValue 2 < 5): the matrix has no sentinel column at all, so the bucket
    // is structurally always 0. Decode still emits it (stable shape); consumers use
    // `questionReservesAbstain` to decide whether to show an "Abstention" field.
    const noHeadroom = bp({ maxCount: 3, maxValue: 2, uniqueValues: true })
    const withoutHeadroom = decodeQuestionResults(
      { ballotProtocol: noHeadroom, choices },
      [
        ['1', '0', '0'],
        ['0', '1', '0'],
        ['0', '0', '1'],
      ]
    )
    expect(withoutHeadroom.at(-1)).toMatchObject({ choice: 'abstain', votes: 0 })
    expect(questionReservesAbstain({ ballotProtocol: noHeadroom, choices })).toBe(false)
  })
})
