import { afterEach, describe, expect, it } from 'vitest'
import {
  clearLocationHash,
  getLocationHash,
  getStorageItem,
  isBrowser,
  removeStorageItem,
  replaceLocationHash,
  setStorageItem,
} from './browser'

afterEach(() => {
  localStorage.clear()
  window.history.pushState({}, '', '/')
})

describe('browser storage helpers', () => {
  it('round-trips localStorage items and removes them', () => {
    expect(getStorageItem('k')).toBeNull()
    setStorageItem('k', 'v')
    expect(getStorageItem('k')).toBe('v')
    removeStorageItem('k')
    expect(getStorageItem('k')).toBeNull()
  })
})

describe('location hash helpers', () => {
  it('reports the current hash without the leading #', () => {
    replaceLocationHash('frag')
    expect(getLocationHash()).toBe('frag')
  })

  it('clears the hash while preserving the query string', () => {
    window.history.pushState({}, '', '/path?q=1#frag')
    expect(getLocationHash()).toBe('frag')

    clearLocationHash()

    expect(window.location.hash).toBe('')
    expect(window.location.search).toBe('?q=1')
    expect(window.location.pathname).toBe('/path')
  })
})

describe('isBrowser', () => {
  it('is true under jsdom', () => {
    expect(isBrowser()).toBe(true)
  })
})
