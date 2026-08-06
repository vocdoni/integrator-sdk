import { describe, it, expect } from 'vitest'
import type { Election } from '@vocdoni/api-types'
import { encodeBallot, encodeQuestionBallot } from './encode'
import { decodeQuestionResults, decodeResults } from './decode'

/**
 * Encode → decode round-trips. Encoding a single voter's selections yields one
 * ballot; turning that ballot into a one-hot histogram (one voter) and decoding it
 * must recover the original selections. This locks the two sides to the same field
 * model — in particular the fixed-length, abstain-padded multichoice ballot.
 */

const createElection = (
  voteType: Partial<Election['voteType']>,
  questions: number = 1,
  choices: number = 5
): Pick<Election, 'questions' | 'voteType' | 'results'> => ({
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

/**
 * One voter's ballot → the results matrix a vochain would hold after that vote.
 *
 * Two modes, matching `results.AddVote`:
 * - `maxValue > 0`: histogram — `results[field][value] += weight`, so one voter
 *   produces a one-hot row per field.
 * - `maxValue === 0` (budget / quadratic): discrete aggregation — the value itself
 *   is summed into `results[field][0]`, and the row stays one cell wide.
 */
const resultsFromBallot = (voteType: Election['voteType'], ballot: number[]): string[][] => {
  if (voteType.maxValue === 0) return ballot.map((value) => [String(value)])
  const width = Math.max(...ballot, 0) + 1
  return ballot.map((value) => {
    const row = new Array(width).fill('0')
    row[value] = '1'
    return row
  })
}

const votesOf = (election: Pick<Election, 'questions' | 'voteType' | 'results'>, ballot: number[]) =>
  decodeResults({ ...election, results: resultsFromBallot(election.voteType, ballot) }).map((q) =>
    q.map((c) => c.votes)
  )

describe('encode ↔ decode round-trip', () => {
  it('single-choice (multi-question)', () => {
    const election = createElection({ maxCount: 1, maxValue: 4 }, 3)
    const ballot = encodeBallot(election, [[4], [3], [2]])
    expect(ballot).toEqual([4, 3, 2])
    expect(votesOf(election, ballot)).toEqual([
      [0, 0, 0, 0, 1], // Q0 → choice 4
      [0, 0, 0, 1, 0], // Q1 → choice 3
      [0, 0, 1, 0, 0], // Q2 → choice 2
    ])
  })

  it('single-choice with sparse (1-indexed) choice values', () => {
    // Values 1/2/3 under a maxValue that covers the highest of them — the shape
    // saas-backend derives for a 1-indexed question. Both sides speak values, so
    // column 0 is never touched and the vote still round-trips to the right choice.
    // Confirmed against a live chain in integration/value-skew.itest.ts, which reads
    // back exactly the row asserted here. See integrator-sdk#28.
    const election: Pick<Election, 'questions' | 'voteType' | 'results'> = {
      voteType: {
        maxCount: 1,
        maxValue: 3,
        maxVoteOverwrites: 0,
        costExponent: 0,
        uniqueChoices: false,
        costFromWeight: false,
      },
      questions: [
        {
          title: { default: 'Question 0' },
          choices: [1, 2, 3].map((v) => ({ title: { default: `C${v}` }, value: v })),
        },
      ],
    }
    const ballot = encodeBallot(election, [[3]])
    expect(ballot).toEqual([3]) // the value, not the position (which would be 2)
    //                                      col: 0  1  2  3
    expect(resultsFromBallot(election.voteType, ballot)).toEqual([['0', '0', '0', '1']])
    // Decode reports votes against the choice VALUES, with C1/C2 at zero.
    expect(
      decodeResults({ ...election, results: resultsFromBallot(election.voteType, ballot) })[0].map(
        (c) => [c.choice, c.votes]
      )
    ).toEqual([
      [1, 0],
      [2, 0],
      [3, 1],
    ])
  })

  it('approval', () => {
    const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
    const ballot = encodeBallot(election, [[0, 2, 4]])
    expect(ballot).toEqual([1, 0, 1, 0, 1])
    expect(votesOf(election, ballot)).toEqual([[1, 0, 1, 0, 1]])
  })

  it('multichoice (uniqueChoices false) surfaces a unified abstain bucket on decode', () => {
    const election = createElection({ maxCount: 3, maxValue: 5, uniqueChoices: false })
    const ballot = encodeBallot(election, [[1, 3]])
    expect(ballot).toEqual([1, 3, 5]) // 5 is the abstain sentinel
    // Real picks (1 and 3) tally as choices; the sentinel column becomes the abstain bucket.
    expect(votesOf(election, ballot)).toEqual([[0, 1, 0, 1, 0, 1]])
  })

  it('multichoice (uniqueChoices true) unifies distinct ascending sentinels back into one bucket', () => {
    // maxValue must reserve one distinct sentinel per empty slot: 5 - 1 + maxCount(3) = 7.
    const election = createElection({ maxCount: 3, maxValue: 7, uniqueChoices: true })
    // One pick (3) leaves two empty slots, padded with distinct ascending sentinels 5 and 6.
    const ballot = encodeBallot(election, [[3]])
    expect(ballot).toEqual([3, 5, 6])
    // Decode recovers the single real pick and unifies both sentinel columns (5 and 6)
    // into one abstain bucket of maxCount - picks = 2.
    expect(votesOf(election, ballot)).toEqual([[0, 0, 0, 1, 0, 2]])
  })

  it('named multichoice (dense) under the fixed config', () => {
    // The shape of the affected live questions once uniqueChoices is off: 4
    // choices, maxChoices 4. Two voters pick {0,2} and {2,3} — the dense matrix
    // is one [notSelected, selected] row per choice.
    const question = {
      type: 'multichoice',
      typeSetup: { minChoices: 0, maxChoices: 4, uniqueChoices: false },
      choices: Array.from({ length: 4 }, (_, j) => ({ title: { default: `C${j}` }, value: j })),
    }

    const ballots = [encodeQuestionBallot(question, [0, 2]), encodeQuestionBallot(question, [2, 3])]
    expect(ballots).toEqual([
      [1, 0, 1, 0],
      [0, 0, 1, 1],
    ])

    // Tally the two ballots the way the scrutinizer does: results[field][value].
    const results = question.choices.map((_c, field) => {
      const row = ['0', '0']
      for (const ballot of ballots) row[ballot[field]] = String(Number(row[ballot[field]]) + 1)
      return row
    })
    expect(results).toEqual([
      ['1', '1'],
      ['2', '0'],
      ['0', '2'],
      ['1', '1'],
    ])

    expect(decodeQuestionResults(question, results).map((c) => c.votes)).toEqual([1, 0, 2, 1])
  })

  it('budget', () => {
    const election = createElection({ maxValue: 0, costExponent: 1 })
    const ballot = encodeBallot(election, [[10, 20, 0, 5, 0]])
    expect(ballot).toEqual([10, 20, 0, 5, 0])
    expect(votesOf(election, ballot)).toEqual([[10, 20, 0, 5, 0]])
  })

  it('quadratic', () => {
    const election = createElection({ maxValue: 0, costExponent: 2 }, 1, 4)
    const ballot = encodeBallot(election, [[2, 2, 2, 0]])
    expect(ballot).toEqual([2, 2, 2, 0])
    expect(votesOf(election, ballot)).toEqual([[2, 2, 2, 0]])
  })
})
