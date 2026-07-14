import { describe, expect, it } from 'vitest'
import type { Election } from '@vocdoni/api-types'
import { hasResults, isLive, isUpcoming } from './election-status'

const base: Election = {
  id: 'election-1',
  address: '0xabc',
  title: { default: 'Test election' },
  status: 'READY',
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-12-31T23:59:59Z',
  organizationId: '0xorg',
  voteCount: 0,
  finalResults: false,
  questions: [],
  voteType: { maxCount: 1, maxValue: 1, maxVoteOverwrites: 0, costExponent: 1, uniqueChoices: false, costFromWeight: false },
  electionType: { interruptible: true, secretUntilTheEnd: false, anonymous: false },
}

const past = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()

describe('isLive', () => {
  it('is true when status is READY and now is between start and end', () => {
    const e: Election = { ...base, startDate: past(1), endDate: future(1) }
    expect(isLive(e)).toBe(true)
  })

  it('is false when status is READY but not yet started', () => {
    const e: Election = { ...base, startDate: future(1), endDate: future(2) }
    expect(isLive(e)).toBe(false)
  })

  it('is false when status is READY but already ended', () => {
    const e: Election = { ...base, startDate: past(2), endDate: past(1) }
    expect(isLive(e)).toBe(false)
  })

  it('is false when status is PAUSED', () => {
    const e: Election = { ...base, status: 'PAUSED', startDate: past(1), endDate: future(1) }
    expect(isLive(e)).toBe(false)
  })

  it('is false when status is ENDED', () => {
    const e: Election = { ...base, status: 'ENDED', startDate: past(2), endDate: past(1) }
    expect(isLive(e)).toBe(false)
  })

  it('is false when status is CANCELED', () => {
    const e: Election = { ...base, status: 'CANCELED', startDate: past(1), endDate: future(1) }
    expect(isLive(e)).toBe(false)
  })
})

describe('isUpcoming', () => {
  it('is true when status is READY and now is before startDate', () => {
    const e: Election = { ...base, startDate: future(1), endDate: future(2) }
    expect(isUpcoming(e)).toBe(true)
  })

  it('is false when status is READY and election has already started', () => {
    const e: Election = { ...base, startDate: past(1), endDate: future(1) }
    expect(isUpcoming(e)).toBe(false)
  })

  it('is false when status is UPCOMING (the API status, not a predicate)', () => {
    const e: Election = { ...base, status: 'UPCOMING', startDate: future(1), endDate: future(2) }
    expect(isUpcoming(e)).toBe(false)
  })

  it('is false when status is PAUSED', () => {
    const e: Election = { ...base, status: 'PAUSED', startDate: future(1), endDate: future(2) }
    expect(isUpcoming(e)).toBe(false)
  })

  it('is false when status is CANCELED', () => {
    const e: Election = { ...base, status: 'CANCELED', startDate: future(1), endDate: future(2) }
    expect(isUpcoming(e)).toBe(false)
  })
})

describe('hasResults', () => {
  it('is true when status is ENDED and finalResults is true', () => {
    const e: Election = { ...base, status: 'ENDED', finalResults: true }
    expect(hasResults(e)).toBe(true)
  })

  it('is false when status is ENDED but finalResults is false', () => {
    const e: Election = { ...base, status: 'ENDED', finalResults: false }
    expect(hasResults(e)).toBe(false)
  })

  it('is false when status is READY even with finalResults true', () => {
    const e: Election = { ...base, status: 'READY', finalResults: true }
    expect(hasResults(e)).toBe(false)
  })

  it('is false when status is PAUSED', () => {
    const e: Election = { ...base, status: 'PAUSED', finalResults: true }
    expect(hasResults(e)).toBe(false)
  })

  it('is false when status is CANCELED', () => {
    const e: Election = { ...base, status: 'CANCELED', finalResults: true }
    expect(hasResults(e)).toBe(false)
  })
})
