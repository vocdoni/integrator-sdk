import { describe, expect, it } from 'vitest'
import type {
  VotingProcessQuestion,
  VotingProcessResponse,
  VotingProcessResultsResponse,
} from '@vocdoni/api-types'
import {
  computeProcessStatus,
  hasResults,
  isLive,
  isSecretUntilTheEnd,
  isUpcoming,
  processVoteCount,
} from './election-status'

const q = (status: VotingProcessQuestion['status']): VotingProcessQuestion =>
  ({ status } as VotingProcessQuestion)

const base: VotingProcessResponse = {
  id: 'proc-1',
  orgAddress: '0000000000000000000000000000000000000001',
  title: { default: 'Test process' },
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-12-31T23:59:59Z',
  published: true,
  census: {},
  questions: [],
}

describe('isLive', () => {
  it('is true when the process status is ONGOING', () => {
    const p: VotingProcessResponse = { ...base, questions: [q('ONGOING')] }
    expect(isLive(p)).toBe(true)
  })

  it('is false when the process status is UPCOMING', () => {
    const p: VotingProcessResponse = { ...base, questions: [q('UPCOMING')] }
    expect(isLive(p)).toBe(false)
  })

  it('is false when the process status is PAUSED', () => {
    const p: VotingProcessResponse = { ...base, questions: [q('PAUSED')] }
    expect(isLive(p)).toBe(false)
  })

  it('is false when the process status is ENDED', () => {
    const p: VotingProcessResponse = { ...base, questions: [q('ENDED')] }
    expect(isLive(p)).toBe(false)
  })

  it('is false when the process status is CANCELED', () => {
    const p: VotingProcessResponse = { ...base, questions: [q('CANCELED')] }
    expect(isLive(p)).toBe(false)
  })

  it('is true when any question is ONGOING (mixed)', () => {
    const p: VotingProcessResponse = { ...base, questions: [q('ENDED'), q('ONGOING')] }
    expect(isLive(p)).toBe(true)
  })

  it('is false when no questions', () => {
    expect(isLive(base)).toBe(false)
  })
})

describe('isUpcoming', () => {
  it('is true when the process status is UPCOMING', () => {
    const p: VotingProcessResponse = { ...base, questions: [q('UPCOMING')] }
    expect(isUpcoming(p)).toBe(true)
  })

  it('is false when status is ONGOING', () => {
    const p: VotingProcessResponse = { ...base, questions: [q('ONGOING')] }
    expect(isUpcoming(p)).toBe(false)
  })

  it('is false when status is PAUSED', () => {
    const p: VotingProcessResponse = { ...base, questions: [q('PAUSED')] }
    expect(isUpcoming(p)).toBe(false)
  })

  it('is false when status is CANCELED', () => {
    const p: VotingProcessResponse = { ...base, questions: [q('CANCELED')] }
    expect(isUpcoming(p)).toBe(false)
  })
})

describe('hasResults', () => {
  it('is true when all questions are RESULTS', () => {
    const p: VotingProcessResponse = { ...base, questions: [q('RESULTS'), q('RESULTS')] }
    expect(hasResults(p)).toBe(true)
  })

  it('is false when status is ENDED (results still computing)', () => {
    const p: VotingProcessResponse = { ...base, questions: [q('ENDED')] }
    expect(hasResults(p)).toBe(false)
  })

  it('is false when mixed ENDED+RESULTS (ENDED status)', () => {
    const p: VotingProcessResponse = { ...base, questions: [q('ENDED'), q('RESULTS')] }
    expect(hasResults(p)).toBe(false)
  })

  it('is false when status is ONGOING', () => {
    const p: VotingProcessResponse = { ...base, questions: [q('ONGOING')] }
    expect(hasResults(p)).toBe(false)
  })
})

describe('computeProcessStatus', () => {
  it('returns PROCESS_UNKNOWN for an empty question list', () => {
    expect(computeProcessStatus([])).toBe('PROCESS_UNKNOWN')
  })

  it('returns ONGOING when any question is ONGOING', () => {
    expect(computeProcessStatus([q('ONGOING'), q('ENDED')])).toBe('ONGOING')
    expect(computeProcessStatus([q('RESULTS'), q('ONGOING'), q('PAUSED')])).toBe('ONGOING')
  })

  it('returns ENDED when all questions are ENDED or RESULTS (results still computing)', () => {
    expect(computeProcessStatus([q('ENDED'), q('RESULTS')])).toBe('ENDED')
    expect(computeProcessStatus([q('RESULTS'), q('ENDED'), q('ENDED')])).toBe('ENDED')
  })

  it('returns RESULTS when all questions are RESULTS', () => {
    expect(computeProcessStatus([q('RESULTS'), q('RESULTS')])).toBe('RESULTS')
  })

  it('returns the shared status when all questions agree', () => {
    expect(computeProcessStatus([q('PAUSED'), q('PAUSED')])).toBe('PAUSED')
    expect(computeProcessStatus([q('CANCELED'), q('CANCELED')])).toBe('CANCELED')
    expect(computeProcessStatus([q('UPCOMING'), q('UPCOMING')])).toBe('UPCOMING')
    expect(computeProcessStatus([q('ENDED'), q('ENDED')])).toBe('ENDED')
    expect(computeProcessStatus([q('ONGOING')])).toBe('ONGOING')
  })

  it('returns PROCESS_UNKNOWN for an unresolvable mixed state', () => {
    expect(computeProcessStatus([q('PAUSED'), q('ENDED')])).toBe('PROCESS_UNKNOWN')
    expect(computeProcessStatus([q('CANCELED'), q('PAUSED')])).toBe('PROCESS_UNKNOWN')
    expect(computeProcessStatus([q('UPCOMING'), q('PAUSED')])).toBe('PROCESS_UNKNOWN')
    // ENDED+CANCELED: CANCELED is terminal but not ENDED/RESULTS, so the mix is unresolvable
    expect(computeProcessStatus([q('ENDED'), q('CANCELED')])).toBe('PROCESS_UNKNOWN')
  })
})

describe('isSecretUntilTheEnd', () => {
  const secretQ = (secret: boolean): VotingProcessQuestion =>
    ({ status: 'ONGOING', secretUntilTheEnd: secret } as VotingProcessQuestion)

  it('is true when any question hides tallies until the end', () => {
    expect(isSecretUntilTheEnd({ ...base, questions: [secretQ(false), secretQ(true)] })).toBe(true)
  })

  it('is false when no question is secret', () => {
    expect(isSecretUntilTheEnd({ ...base, questions: [secretQ(false)] })).toBe(false)
    expect(isSecretUntilTheEnd(base)).toBe(false)
  })
})

describe('processVoteCount', () => {
  const results = (...voteCounts: number[]): VotingProcessResultsResponse => ({
    id: base.id,
    questions: voteCounts.map((voteCount, i) => ({
      questionId: `q-${i}`,
      status: 'RESULTS',
      voteCount,
      startDate: base.startDate,
      endDate: base.endDate,
      finalResults: true,
    })),
  })

  it('returns the highest per-question count (unique ballots, not a sum)', () => {
    expect(processVoteCount(results(10, 8, 10))).toBe(10)
  })

  it('returns 0 for missing results or an empty question list', () => {
    expect(processVoteCount(undefined)).toBe(0)
    expect(processVoteCount(null)).toBe(0)
    expect(processVoteCount(results())).toBe(0)
  })
})
