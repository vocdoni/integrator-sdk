import { describe, expect, it } from 'vitest'
import { errorToString, normalizeText } from './utils'

describe('errorToString', () => {
  it('returns a plain string error unchanged', () => {
    expect(errorToString('boom')).toBe('boom')
  })
  it('prefers data.error, then message, then reason', () => {
    expect(errorToString({ data: { error: 'from-data' }, message: 'm' })).toBe('from-data')
    expect(errorToString({ message: 'from-message' })).toBe('from-message')
    expect(errorToString({ reason: 'from-reason' })).toBe('from-reason')
  })
})

describe('normalizeText', () => {
  it('returns empty string for falsy input', () => {
    expect(normalizeText()).toBe('')
    expect(normalizeText('')).toBe('')
  })

  it('collapses whitespace, lowercases and latinizes accents', () => {
    expect(normalizeText('  Héllo   Wörld ')).toBe('hello world')
    expect(normalizeText('TèXt')).toBe('text')
  })
})
