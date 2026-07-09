import { describe, it, expect } from 'vitest'
import type { Election } from '@vocdoni/api-types'
import { encodeBallot } from './encode.js'
import { decodeResults } from './decode.js'

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

/** One voter's ballot → rectangular one-hot histogram (results[field][value] = 1). */
const histogramFromBallot = (ballot: number[]): string[][] => {
  const width = Math.max(...ballot, 0) + 1
  return ballot.map((value) => {
    const row = new Array(width).fill('0')
    row[value] = '1'
    return row
  })
}

const votesOf = (election: Pick<Election, 'questions' | 'voteType' | 'results'>, ballot: number[]) =>
  decodeResults({ ...election, results: histogramFromBallot(ballot) }).map((q) => q.map((c) => c.votes))

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

  it('approval', () => {
    const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
    const ballot = encodeBallot(election, [[0, 2, 4]])
    expect(ballot).toEqual([1, 0, 1, 0, 1])
    expect(votesOf(election, ballot)).toEqual([[1, 0, 1, 0, 1]])
  })

  it('multichoice with abstain padding drops the sentinels on decode', () => {
    const election = createElection({ maxCount: 3, maxValue: 5, uniqueChoices: false })
    const ballot = encodeBallot(election, [[1, 3]])
    expect(ballot).toEqual([1, 3, 5]) // 5 is the abstain sentinel
    // Only the real picks (1 and 3) survive decode; the abstain column is ignored.
    expect(votesOf(election, ballot)).toEqual([[0, 1, 0, 1, 0]])
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
